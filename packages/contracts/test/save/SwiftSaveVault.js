import assert from "node:assert/strict";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

async function deployFixture() {
  const [owner, user, other] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory("MockUSDC");
  const usdc = await Mock.deploy();
  await usdc.waitForDeployment();

  const Vault = await ethers.getContractFactory("SwiftSaveVault");
  const vault = await Vault.deploy(owner.address, [await usdc.getAddress()]);
  await vault.waitForDeployment();

  const mintAmount = ethers.parseUnits("1000", 6);
  await (await usdc.mint(user.address, mintAmount)).wait();

  return { owner, user, other, usdc, vault, mintAmount };
}

describe("SwiftSaveVault", () => {
  it("deposits and withdraws without interest", async () => {
    const { user, usdc, vault } = await deployFixture();
    const pocketId = ethers.id("emergency-fund");
    const amount = ethers.parseUnits("100", 6);
    const token = await usdc.getAddress();

    await (await usdc.connect(user).approve(await vault.getAddress(), amount)).wait();
    await (await vault.connect(user).deposit(pocketId, token, amount)).wait();

    assert.equal(
      await vault.pocketBalance(user.address, pocketId, token),
      amount,
    );
    assert.equal(await usdc.balanceOf(await vault.getAddress()), amount);

    await (await vault.connect(user).withdraw(pocketId, token, amount)).wait();
    assert.equal(
      await vault.pocketBalance(user.address, pocketId, token),
      0n,
    );
  });

  it("rejects withdraw above pocket balance", async () => {
    const { user, usdc, vault } = await deployFixture();
    const pocketId = ethers.id("phone");
    const amount = ethers.parseUnits("10", 6);
    const token = await usdc.getAddress();

    await (await usdc.connect(user).approve(await vault.getAddress(), amount)).wait();
    await (await vault.connect(user).deposit(pocketId, token, amount)).wait();

    let failed = false;
    try {
      await vault.connect(user).withdraw(pocketId, token, amount + 1n);
    } catch {
      failed = true;
    }
    assert.ok(failed, "expected withdraw above balance to revert");
  });

  it("isolates pockets and owners", async () => {
    const { user, other, usdc, vault } = await deployFixture();
    const token = await usdc.getAddress();
    const pocketA = ethers.id("a");
    const pocketB = ethers.id("b");
    const amount = ethers.parseUnits("25", 6);

    await (await usdc.mint(other.address, amount)).wait();
    await (await usdc.connect(user).approve(await vault.getAddress(), amount)).wait();
    await (await usdc.connect(other).approve(await vault.getAddress(), amount)).wait();

    await (await vault.connect(user).deposit(pocketA, token, amount)).wait();
    await (await vault.connect(other).deposit(pocketB, token, amount)).wait();

    assert.equal(
      await vault.pocketBalance(user.address, pocketA, token),
      amount,
    );
    assert.equal(
      await vault.pocketBalance(user.address, pocketB, token),
      0n,
    );
    assert.equal(
      await vault.pocketBalance(other.address, pocketA, token),
      0n,
    );

    let failed = false;
    try {
      await vault.connect(other).withdraw(pocketA, token, amount);
    } catch {
      failed = true;
    }
    assert.ok(failed, "other user must not withdraw from foreign pocket");
  });
});
