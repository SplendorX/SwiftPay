import assert from "node:assert/strict";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

const USDC = (n) => ethers.parseUnits(String(n), 6);
const execId = (label) => ethers.keccak256(ethers.toUtf8Bytes(label));

async function deployFixture() {
  const [owner, operator, user, stranger, guardian] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const Vault = await ethers.getContractFactory("MockERC4626Vault");
  const vault = await Vault.deploy(await usdc.getAddress());

  const Executor = await ethers.getContractFactory("EarnAutoSaveExecutor");
  const executor = await Executor.deploy(
    await usdc.getAddress(),
    await vault.getAddress(),
    operator.address,
    owner.address,
    guardian.address,
  );

  await usdc.mint(user.address, USDC(1_000));
  await (await usdc.connect(user).approve(await executor.getAddress(), USDC(1_000))).wait();

  return { executor, guardian, operator, owner, stranger, usdc, user, vault };
}

describe("EarnAutoSaveExecutor", () => {
  it("deposits the user's USDC into the vault in the user's name", async () => {
    const { executor, operator, usdc, user, vault } = await deployFixture();
    const executorAddress = await executor.getAddress();

    await (await executor.connect(operator).executeAutoSave(execId("a"), user.address, USDC(25))).wait();

    assert.equal(await usdc.balanceOf(user.address), USDC(975));
    assert.equal(await vault.maxWithdraw(user.address), USDC(25));
    assert.equal(await vault.balanceOf(executorAddress), 0n);
    assert.equal(await usdc.balanceOf(executorAddress), 0n);
    assert.equal(await usdc.allowance(executorAddress, await vault.getAddress()), 0n);
  });

  it("only lets the operator execute", async () => {
    const { executor, stranger, user } = await deployFixture();
    await assert.rejects(
      executor.connect(stranger).executeAutoSave(execId("a"), user.address, USDC(1)),
      /NotOperator/,
    );
  });

  it("never executes the same id twice", async () => {
    const { executor, operator, user } = await deployFixture();
    await (await executor.connect(operator).executeAutoSave(execId("a"), user.address, USDC(1))).wait();
    await assert.rejects(
      executor.connect(operator).executeAutoSave(execId("a"), user.address, USDC(1)),
      /AlreadyExecuted/,
    );
  });

  it("rejects a zero amount and a zero user", async () => {
    const { executor, operator, user } = await deployFixture();
    await assert.rejects(
      executor.connect(operator).executeAutoSave(execId("a"), user.address, 0),
      /ZeroAmount/,
    );
    await assert.rejects(
      executor.connect(operator).executeAutoSave(execId("b"), ethers.ZeroAddress, USDC(1)),
      /ZeroAddress/,
    );
  });

  it("stops while paused by the guardian", async () => {
    const { executor, guardian, operator, user } = await deployFixture();
    await (await executor.connect(guardian).pause()).wait();
    await assert.rejects(
      executor.connect(operator).executeAutoSave(execId("a"), user.address, USDC(1)),
      /EnforcedPause/,
    );
  });

  it("refuses a vault whose asset is not USDC", async () => {
    const [owner, operator, , , guardian] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    const other = await MockUSDC.deploy();
    const vault = await (await ethers.getContractFactory("MockERC4626Vault")).deploy(
      await other.getAddress(),
    );
    const Executor = await ethers.getContractFactory("EarnAutoSaveExecutor");
    await assert.rejects(
      Executor.deploy(
        await usdc.getAddress(),
        await vault.getAddress(),
        operator.address,
        owner.address,
        guardian.address,
      ),
      /InvalidVaultAsset/,
    );
  });

  it("only lets the owner change the operator", async () => {
    const { executor, owner, stranger } = await deployFixture();
    await assert.rejects(executor.connect(stranger).setOperator(stranger.address));
    await (await executor.connect(owner).setOperator(stranger.address)).wait();
    assert.equal(await executor.operator(), stranger.address);
  });
});
