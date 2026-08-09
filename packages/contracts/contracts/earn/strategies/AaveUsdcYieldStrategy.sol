// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";
import {IAaveV3Pool, IAToken} from "../interfaces/IAaveV3Pool.sol";

/// @title AaveUsdcYieldStrategy
/// @notice Supplies USDC into an Aave V3-compatible Pool and tracks aToken balances.
/// @dev Production path: set verified Pool + aToken from official deployments via constructor/env.
///      Testnet path: deploy against MockAavePool when real Aave is not live on Arc.
///      Switch mainnet by redeploying (or migrating vault strategy) with mainnet addresses —
///      never invent Pool/aToken addresses.
contract AaveUsdcYieldStrategy is IYieldStrategy, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    IAaveV3Pool public immutable pool;
    IAToken public immutable aToken;
    address public override vault;

    /// @notice True when wired to MockAavePool / simulation infrastructure.
    bool public immutable isSimulation;

    bool public depositsEnabled = true;

    error ZeroAddress();
    error OnlyVault();
    error InvalidAsset();
    error InvalidAToken();
    error DepositsDisabled();
    error Unhealthy();
    error ZeroAmount();

    event VaultUpdated(address indexed previousVault, address indexed newVault);
    event DepositsEnabledUpdated(bool enabled);

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    /// @param asset_ USDC token
    /// @param pool_ Aave Pool (or MockAavePool)
    /// @param aToken_ Interest-bearing aToken for USDC
    /// @param vault_ SwiftPayVault address (can be set later if zero)
    /// @param owner_ Multisig / timelock compatible owner
    /// @param isSimulation_ Mark true for mock/testnet simulation adapters
    constructor(
        address asset_,
        address pool_,
        address aToken_,
        address vault_,
        address owner_,
        bool isSimulation_
    ) Ownable(owner_) {
        if (asset_ == address(0) || pool_ == address(0) || aToken_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }

        asset = asset_;
        pool = IAaveV3Pool(pool_);
        aToken = IAToken(aToken_);
        isSimulation = isSimulation_;

        if (IAToken(aToken_).UNDERLYING_ASSET_ADDRESS() != asset_) {
            revert InvalidAsset();
        }

        // Best-effort pool consistency check (mock + real aTokens expose POOL()).
        try IAToken(aToken_).POOL() returns (address reportedPool) {
            if (reportedPool != pool_) revert InvalidAToken();
        } catch {
            // Some deployments may omit POOL(); addresses must still be verified off-chain.
        }

        if (vault_ != address(0)) {
            vault = vault_;
        }
    }

    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert ZeroAddress();
        emit VaultUpdated(vault, newVault);
        vault = newVault;
    }

    function setDepositsEnabled(bool enabled) external onlyOwner {
        depositsEnabled = enabled;
        emit DepositsEnabledUpdated(enabled);
    }

    /// @inheritdoc IYieldStrategy
    function strategyName() external view returns (string memory) {
        if (isSimulation) {
            return "Aave USDC Supply (Simulation)";
        }
        return "Aave USDC Supply";
    }

    /// @inheritdoc IYieldStrategy
    function totalAssets() public view returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /// @inheritdoc IYieldStrategy
    function isHealthy() public view returns (bool) {
        if (!depositsEnabled) return false;
        if (vault == address(0)) return false;
        // aToken must still report this strategy as the underlying holder path.
        if (aToken.UNDERLYING_ASSET_ADDRESS() != asset) return false;
        return true;
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Vault must transfer USDC to this contract before calling, or approve this contract.
    function deposit(uint256 amount) external onlyVault nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!depositsEnabled) revert DepositsDisabled();
        if (!isHealthy()) revert Unhealthy();

        IERC20 token = IERC20(asset);

        // Pull from vault if allowance set; otherwise expect pre-funded balance.
        uint256 balance = token.balanceOf(address(this));
        if (balance < amount) {
            token.safeTransferFrom(vault, address(this), amount - balance);
        }

        token.forceApprove(address(pool), amount);
        pool.supply(asset, amount, address(this), 0);
        token.forceApprove(address(pool), 0);
    }

    /// @inheritdoc IYieldStrategy
    function withdraw(uint256 amount) external onlyVault nonReentrant returns (uint256 withdrawn) {
        if (amount == 0) revert ZeroAmount();
        withdrawn = pool.withdraw(asset, amount, vault);
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Aave aTokens auto-accrue; no explicit compound required.
    function harvest() external onlyVault returns (uint256 harvested) {
        return 0;
    }

    /// @inheritdoc IYieldStrategy
    function emergencyWithdraw() external onlyVault nonReentrant returns (uint256 withdrawn) {
        uint256 balance = totalAssets();
        if (balance == 0) return 0;
        withdrawn = pool.withdraw(asset, type(uint256).max, vault);
    }
}
