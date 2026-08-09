// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";

/// @title MockYieldStrategy
/// @notice Idle USDC holder for UI testing when no Aave market is configured.
/// @dev Always simulation — never claim real yield. Prefer AaveUsdcYieldStrategy + MockAavePool
///      when testing the Aave integration path.
contract MockYieldStrategy is IYieldStrategy, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    address public override vault;
    bool public healthy = true;

    error ZeroAddress();
    error OnlyVault();
    error Unhealthy();
    error ZeroAmount();

    event VaultUpdated(address indexed previousVault, address indexed newVault);
    event SimulatedYield(uint256 amount);

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address asset_, address vault_, address owner_) Ownable(owner_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        asset = asset_;
        vault = vault_;
    }

    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert ZeroAddress();
        emit VaultUpdated(vault, newVault);
        vault = newVault;
    }

    function setHealthy(bool value) external onlyOwner {
        healthy = value;
    }

    /// @notice Credit simulated yield for UI tests (owner-only).
    function simulateYield(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        emit SimulatedYield(amount);
    }

    function strategyName() external pure returns (string memory) {
        return "Mock Idle USDC (Simulation)";
    }

    function totalAssets() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function isHealthy() public view returns (bool) {
        return healthy && vault != address(0);
    }

    function deposit(uint256 amount) external onlyVault nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!isHealthy()) revert Unhealthy();
        IERC20 token = IERC20(asset);
        uint256 balance = token.balanceOf(address(this));
        if (balance < amount) {
            token.safeTransferFrom(vault, address(this), amount - balance);
        }
    }

    function withdraw(uint256 amount) external onlyVault nonReentrant returns (uint256 withdrawn) {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = totalAssets();
        withdrawn = amount > balance ? balance : amount;
        IERC20(asset).safeTransfer(vault, withdrawn);
    }

    function harvest() external onlyVault returns (uint256) {
        return 0;
    }

    function emergencyWithdraw() external onlyVault nonReentrant returns (uint256 withdrawn) {
        withdrawn = totalAssets();
        if (withdrawn > 0) {
            IERC20(asset).safeTransfer(vault, withdrawn);
        }
    }
}
