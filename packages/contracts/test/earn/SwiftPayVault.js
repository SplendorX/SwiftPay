import assert from "node:assert/strict";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

const USDC = (n) => ethers.parseUnits(String(n), 6);

function almostEqual(actual, expected, tolerance = 2n) {
  const diff = actual > expected ? actual - expected : expected - actual;
  assert.ok(
    diff <= tolerance,
    `Expected ${actual} ≈ ${expected} (tol ${tolerance}), diff=${diff}`,
  );
}

async function deployFixture() {
  const [owner, alice, bob, feeRecipient, guardian, stranger] =
    await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const Vault = await ethers.getContractFactory("SwiftPayVault");
  const vault = await Vault.deploy(
    await usdc.getAddress(),
    owner.address,
    guardian.address,
    feeRecipient.address,
    "SwiftPay Earn USDC",
    "spUSDC",
  );
  await vault.waitForDeployment();

  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const pool = await MockAavePool.deploy();
  await pool.waitForDeployment();
  await (await pool.initReserve(await usdc.getAddress())).wait();
  const aTokenAddress = await pool.aTokens(await usdc.getAddress());

  const Strategy = await ethers.getContractFactory("AaveUsdcYieldStrategy");
  const strategy = await Strategy.deploy(
    await usdc.getAddress(),
    await pool.getAddress(),
    aTokenAddress,
    await vault.getAddress(),
    owner.address,
    true,
  );
  await strategy.waitForDeployment();

  await (await vault.setStrategy(await strategy.getAddress())).wait();

  await usdc.mint(alice.address, USDC(10_000));
  await usdc.mint(bob.address, USDC(10_000));
  await usdc.mint(owner.address, USDC(10_000));

  return {
    owner,
    alice,
    bob,
    feeRecipient,
    guardian,
    stranger,
    usdc,
    vault,
    pool,
    strategy,
  };
}

describe("SwiftPayVault + AaveUsdcYieldStrategy", () => {
  it("deposits into Aave mock and mints shares", async () => {
    const { alice, usdc, vault, strategy } = await deployFixture();
    const amount = USDC(1_000);

    await usdc.connect(alice).approve(await vault.getAddress(), amount);
    await vault.connect(alice).deposit(amount, alice.address);

    assert.ok((await vault.balanceOf(alice.address)) > 0n);
    assert.equal(await vault.totalAssets(), amount);
    assert.equal(await strategy.totalAssets(), amount);
    assert.equal(await strategy.isSimulation(), true);
  });

  it("withdraws principal back to user", async () => {
    const { alice, usdc, vault } = await deployFixture();
    const amount = USDC(500);

    await usdc.connect(alice).approve(await vault.getAddress(), amount);
    await vault.connect(alice).deposit(amount, alice.address);

    const before = await usdc.balanceOf(alice.address);
    await vault.connect(alice).withdraw(amount, alice.address, alice.address);
    const after = await usdc.balanceOf(alice.address);

    assert.equal(after - before, amount);
    assert.equal(await vault.totalAssets(), 0n);
  });

  it("does not charge performance fee on deposit alone", async () => {
    const { alice, feeRecipient, usdc, vault } = await deployFixture();
    const amount = USDC(1_000);

    await usdc.connect(alice).approve(await vault.getAddress(), amount);
    await vault.connect(alice).deposit(amount, alice.address);

    const feeBefore = await vault.balanceOf(feeRecipient.address);
    await vault.harvest();
    const feeAfter = await vault.balanceOf(feeRecipient.address);

    assert.equal(feeAfter, feeBefore);
    assert.equal(await vault.assetsHighWaterMark(), amount);
  });

  it("charges the 5% default performance fee only on simulated yield", async () => {
    const { alice, feeRecipient, usdc, vault, pool, strategy } =
      await deployFixture();
    const amount = USDC(1_000);
    const yieldAmount = USDC(100);

    await usdc.connect(alice).approve(await vault.getAddress(), amount);
    await vault.connect(alice).deposit(amount, alice.address);

    // Fund pool so yield is withdrawable, then accrue aTokens on strategy
    await usdc.mint(await pool.getAddress(), yieldAmount);
    await pool.simulateYield(
      await usdc.getAddress(),
      await strategy.getAddress(),
      yieldAmount,
    );

    assert.equal(await vault.totalAssets(), amount + yieldAmount);

    await vault.harvest();

    const feeShares = await vault.balanceOf(feeRecipient.address);
    assert.ok(feeShares > 0n, "fee shares should be minted");

    const feeAssets = await vault.convertToAssets(feeShares);
    // 5 USDC (5% of 100). Fee shares are priced so they're worth the full fee.
    almostEqual(feeAssets, USDC(5), 10n);

    const aliceAssets = await vault.convertToAssets(
      await vault.balanceOf(alice.address),
    );
    // Alice keeps principal + 95 net yield
    almostEqual(aliceAssets, USDC(1_095), 10n);
  });

  it("protects against first-depositor inflation attack", async () => {
    const { alice, bob, usdc, vault } = await deployFixture();

    const dust = USDC(1);
    await usdc.connect(alice).approve(await vault.getAddress(), dust);
    await vault.connect(alice).deposit(dust, alice.address);

    // Donation to vault idle balance (classic inflation vector)
    const donation = USDC(5_000);
    await usdc.mint(alice.address, donation);
    await usdc.connect(alice).transfer(await vault.getAddress(), donation);

    const victimAmount = USDC(1_000);
    await usdc.connect(bob).approve(await vault.getAddress(), victimAmount);
    await vault.connect(bob).deposit(victimAmount, bob.address);

    const bobShares = await vault.balanceOf(bob.address);
    assert.ok(bobShares > 0n, "victim must receive shares");

    const bobAssets = await vault.convertToAssets(bobShares);
    // Virtual offset keeps victim value near deposit (not rounded to zero)
    assert.ok(
      bobAssets >= victimAmount - USDC(5),
      `victim assets ${bobAssets} too low vs deposit ${victimAmount}`,
    );
  });

  it("migrates strategy safely", async () => {
    const { owner, alice, usdc, vault } = await deployFixture();
    const amount = USDC(800);

    await usdc.connect(alice).approve(await vault.getAddress(), amount);
    await vault.connect(alice).deposit(amount, alice.address);

    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const pool2 = await MockAavePool.deploy();
    await pool2.waitForDeployment();
    await (await pool2.initReserve(await usdc.getAddress())).wait();
    const aToken2 = await pool2.aTokens(await usdc.getAddress());

    const Strategy = await ethers.getContractFactory("AaveUsdcYieldStrategy");
    const strategy2 = await Strategy.deploy(
      await usdc.getAddress(),
      await pool2.getAddress(),
      aToken2,
      await vault.getAddress(),
      owner.address,
      true,
    );
    await strategy2.waitForDeployment();

    await (await vault.setStrategy(await strategy2.getAddress())).wait();

    assert.equal(await strategy2.totalAssets(), amount);
    assert.equal(await vault.totalAssets(), amount);
  });

  it("pauses deposits", async () => {
    const { owner, alice, usdc, vault } = await deployFixture();
    await vault.connect(owner).pause();

    await usdc.connect(alice).approve(await vault.getAddress(), USDC(10));
    let failed = false;
    try {
      await vault.connect(alice).deposit(USDC(10), alice.address);
    } catch {
      failed = true;
    }
    assert.equal(failed, true, "deposit should revert while paused");
  });

  it("reports strategy name as simulation on mock", async () => {
    const { strategy } = await deployFixture();
    assert.equal(
      await strategy.strategyName(),
      "Aave USDC Supply (Simulation)",
    );
  });

  it("does not charge the fee again when yield only recovers a loss", async () => {
    const { alice, feeRecipient, usdc, vault, pool, strategy } =
      await deployFixture();
    const asset = await usdc.getAddress();
    const strategyAddress = await strategy.getAddress();

    await usdc.connect(alice).approve(await vault.getAddress(), USDC(1_000));
    await vault.connect(alice).deposit(USDC(1_000), alice.address);

    // +100 yield, harvested: 5 fee, mark at 1,100.
    await usdc.mint(await pool.getAddress(), USDC(300));
    await pool.simulateYield(asset, strategyAddress, USDC(100));
    await vault.harvest();
    const feeSharesAfterFirst = await vault.balanceOf(feeRecipient.address);
    assert.equal(await vault.assetsHighWaterMark(), USDC(1_100));

    // -100 loss: no fee, and the mark stays at 1,100.
    await pool.simulateLoss(asset, strategyAddress, USDC(100));
    await vault.harvest();
    assert.equal(await vault.assetsHighWaterMark(), USDC(1_100));

    // +100 recovery back to 1,100: still no new fee.
    await pool.simulateYield(asset, strategyAddress, USDC(100));
    await vault.harvest();
    assert.equal(await vault.balanceOf(feeRecipient.address), feeSharesAfterFirst);

    // +100 of genuinely new yield is charged again.
    await pool.simulateYield(asset, strategyAddress, USDC(100));
    await vault.harvest();
    assert.ok((await vault.balanceOf(feeRecipient.address)) > feeSharesAfterFirst);
    assert.equal(await vault.assetsHighWaterMark(), USDC(1_200));
  });

  it("keeps withdrawals open while paused", async () => {
    const { alice, guardian, usdc, vault } = await deployFixture();
    await usdc.connect(alice).approve(await vault.getAddress(), USDC(100));
    await vault.connect(alice).deposit(USDC(100), alice.address);

    await vault.connect(guardian).pause();

    const before = await usdc.balanceOf(alice.address);
    await vault.connect(alice).redeem(
      await vault.balanceOf(alice.address),
      alice.address,
      alice.address,
    );
    almostEqual((await usdc.balanceOf(alice.address)) - before, USDC(100), 1n);
  });

  it("lets the guardian pause and pull funds home, but nothing more", async () => {
    const { guardian, stranger, alice, usdc, vault, strategy } =
      await deployFixture();
    await usdc.connect(alice).approve(await vault.getAddress(), USDC(100));
    await vault.connect(alice).deposit(USDC(100), alice.address);

    await vault.connect(guardian).emergencyWithdrawFromStrategy();
    assert.equal(await strategy.totalAssets(), 0n);
    assert.equal(await usdc.balanceOf(await vault.getAddress()), USDC(100));

    await vault.connect(guardian).pause();
    await assert.rejects(vault.connect(guardian).unpause());
    await assert.rejects(vault.connect(guardian).setFeeRecipient(guardian.address));
    await assert.rejects(vault.connect(guardian).setStrategy(await strategy.getAddress()));
    await assert.rejects(vault.connect(stranger).pause());
  });

  it("never lets the strategy's vault be changed", async () => {
    const { owner, strategy } = await deployFixture();
    await assert.rejects(
      strategy.connect(owner).setVault(owner.address),
      /VaultAlreadySet/,
    );
  });

  it("uses two-step ownership", async () => {
    const { owner, stranger, vault } = await deployFixture();
    await vault.connect(owner).transferOwnership(stranger.address);
    assert.equal(await vault.owner(), owner.address);
    await vault.connect(stranger).acceptOwnership();
    assert.equal(await vault.owner(), stranger.address);
  });
});
