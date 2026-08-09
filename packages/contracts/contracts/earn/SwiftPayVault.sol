// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";
import {VaultMath} from "./libraries/VaultMath.sol";

/// @title SwiftPayVault
/// @notice ERC-4626 USDC vault with pluggable yield strategy and performance fees.
/// @dev Accounting is on-chain only. Backend must never override balances.
///      Performance fee uses high-water-mark assets tracking to avoid fees on deposits.
contract SwiftPayVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using VaultMath for uint256;

    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20%
    uint256 public constant DEFAULT_PERFORMANCE_FEE_BPS = 1_000; // 10%

    IYieldStrategy public strategy;
    address public feeRecipient;
    uint256 public performanceFeeBps = DEFAULT_PERFORMANCE_FEE_BPS;

    /// @notice Asset high-water mark for fee accounting (principal-adjusted).
    /// @dev Increased on deposit, decreased on withdraw, set to totalAssets after fee harvest.
    uint256 public assetsHighWaterMark;

    bool public strategyDepositsEnabled = true;

    error ZeroAddress();
    error FeeTooHigh();
    error StrategyUnhealthy();
    error StrategyNotSet();
    error InvalidStrategyAsset();
    error MigrationFailed();
    error ZeroShares();
    error ZeroAssets();

    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event Harvest(uint256 totalAssetsAfter, uint256 timestamp);
    event PerformanceFeeCollected(uint256 grossYield, uint256 fee, uint256 timestamp);
    event EmergencyWithdraw(address indexed strategy, uint256 amount);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PerformanceFeeUpdated(uint256 previousBps, uint256 newBps);
    event StrategyDepositsEnabledUpdated(bool enabled);

    constructor(
        IERC20 asset_,
        address owner_,
        address feeRecipient_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(asset_) Ownable(owner_) {
        if (address(asset_) == address(0) || owner_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        feeRecipient = feeRecipient_;
    }

    /// @dev Virtual offset mitigates ERC-4626 inflation / first-depositor attacks.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 inStrategy = address(strategy) == address(0) ? 0 : strategy.totalAssets();
        return idle + inStrategy;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || !strategyDepositsEnabled) return 0;
        if (address(strategy) != address(0) && !strategy.isHealthy()) return 0;
        return type(uint256).max;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 maxAssets = maxDeposit(receiver);
        if (maxAssets == 0) return 0;
        if (maxAssets == type(uint256).max) return type(uint256).max;
        return convertToShares(maxAssets);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deposit / withdraw hooks
    // ─────────────────────────────────────────────────────────────────────────

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        shares = super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        assets = super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        shares = super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        assets = super.redeem(shares, receiver, owner_);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        if (shares == 0) revert ZeroShares();
        if (assets == 0) revert ZeroAssets();
        if (strategyDepositsEnabled && address(strategy) != address(0) && !strategy.isHealthy()) {
            revert StrategyUnhealthy();
        }

        super._deposit(caller, receiver, assets, shares);

        // Deposits are principal — raise HWM so they never look like yield.
        assetsHighWaterMark += assets;

        _allocateToStrategy(assets);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        if (shares == 0) revert ZeroShares();
        if (assets == 0) revert ZeroAssets();

        _ensureLiquidity(assets);

        // Reduce HWM by withdrawn principal so future yield is measured correctly.
        uint256 hwm = assetsHighWaterMark;
        if (assets >= hwm) {
            assetsHighWaterMark = 0;
        } else {
            assetsHighWaterMark = hwm - assets;
        }

        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    function _allocateToStrategy(uint256 assets) internal {
        if (assets == 0 || address(strategy) == address(0) || !strategyDepositsEnabled) {
            return;
        }
        if (!strategy.isHealthy()) {
            return;
        }

        IERC20(asset()).forceApprove(address(strategy), assets);
        strategy.deposit(assets);
        IERC20(asset()).forceApprove(address(strategy), 0);
    }

    function _ensureLiquidity(uint256 assetsNeeded) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= assetsNeeded) {
            return;
        }
        if (address(strategy) == address(0)) {
            return;
        }
        uint256 shortfall = assetsNeeded - idle;
        strategy.withdraw(shortfall);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Harvest / fees
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Realize performance fee on positive yield above the high-water mark.
    /// @dev Does not charge on deposits/withdrawals. Safe to call periodically.
    function harvest() external nonReentrant returns (uint256 fee, uint256 grossYield) {
        if (address(strategy) != address(0)) {
            strategy.harvest();
        }

        uint256 assets_ = totalAssets();
        uint256 hwm = assetsHighWaterMark;

        if (assets_ > hwm) {
            grossYield = assets_ - hwm;
            fee = VaultMath.performanceFee(grossYield, performanceFeeBps);

            if (fee > 0) {
                // Mint fee shares to recipient so fee is taken from yield, not principal.
                uint256 feeShares = convertToShares(fee);
                if (feeShares > 0) {
                    _mint(feeRecipient, feeShares);
                }
                emit PerformanceFeeCollected(grossYield, fee, block.timestamp);
            }
        }

        // Reset HWM to current assets after fee share minting (totalAssets unchanged by mint).
        assetsHighWaterMark = totalAssets();
        emit Harvest(assetsHighWaterMark, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Strategy management
    // ─────────────────────────────────────────────────────────────────────────

    function setStrategy(address newStrategy) external onlyOwner nonReentrant {
        if (newStrategy == address(0)) revert ZeroAddress();
        if (IYieldStrategy(newStrategy).asset() != asset()) revert InvalidStrategyAsset();

        address old = address(strategy);

        // Pull capital from old strategy first.
        if (old != address(0)) {
            uint256 pulled = IYieldStrategy(old).emergencyWithdraw();
            emit EmergencyWithdraw(old, pulled);
        }

        uint256 free = IERC20(asset()).balanceOf(address(this));
        strategy = IYieldStrategy(newStrategy);

        if (free > 0 && strategy.isHealthy() && strategyDepositsEnabled) {
            IERC20(asset()).forceApprove(newStrategy, free);
            strategy.deposit(free);
            IERC20(asset()).forceApprove(newStrategy, 0);
        }

        // Verify accounting: idle + strategy should equal free capital placed.
        if (totalAssets() == 0 && free > 0) {
            revert MigrationFailed();
        }

        // Align HWM to current assets after migration (no fee on migration).
        assetsHighWaterMark = totalAssets();

        emit StrategyUpdated(old, newStrategy);
    }

    function setStrategyDepositsEnabled(bool enabled) external onlyOwner {
        strategyDepositsEnabled = enabled;
        emit StrategyDepositsEnabledUpdated(enabled);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    function setPerformanceFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_PERFORMANCE_FEE_BPS) revert FeeTooHigh();
        emit PerformanceFeeUpdated(performanceFeeBps, newBps);
        performanceFeeBps = newBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Emergency pull all strategy funds to the vault (does not send to users).
    function emergencyWithdrawFromStrategy() external onlyOwner nonReentrant returns (uint256 amount) {
        if (address(strategy) == address(0)) revert StrategyNotSet();
        amount = strategy.emergencyWithdraw();
        emit EmergencyWithdraw(address(strategy), amount);
    }
}
