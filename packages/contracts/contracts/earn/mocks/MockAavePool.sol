// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {MockAToken} from "./MockAToken.sol";

/// @title MockAavePool
/// @notice Aave V3-compatible supply/withdraw surface for Arc testnet / local tests.
/// @dev Explicitly simulation-only. Does not generate real economic yield unless
///      `simulateYield` is called by the test operator.
contract MockAavePool {
    using SafeERC20 for IERC20;

    mapping(address => address) public aTokens;
    bool public paused;

    error ZeroAddress();
    error ZeroAmount();
    error AssetNotListed();
    error Paused();
    error InsufficientLiquidity();

    event ReserveInitialized(address indexed asset, address indexed aToken);
    event Supply(address indexed asset, address indexed onBehalfOf, uint256 amount);
    event Withdraw(address indexed asset, address indexed to, uint256 amount);
    event YieldSimulated(address indexed asset, address indexed onBehalfOf, uint256 amount);

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    function setPaused(bool value) external {
        paused = value;
    }

    /// @notice List an asset with a freshly deployed mock aToken.
    function initReserve(address asset) external returns (address aToken) {
        if (asset == address(0)) revert ZeroAddress();
        if (aTokens[asset] != address(0)) {
            return aTokens[asset];
        }

        MockAToken token = new MockAToken(
            asset,
            address(this),
            "Mock Aave USDC",
            "mAUSDC",
            6
        );
        aTokens[asset] = address(token);
        emit ReserveInitialized(asset, address(token));
        return address(token);
    }

    function getReserveAToken(address asset) external view returns (address) {
        return aTokens[asset];
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (onBehalfOf == address(0)) revert ZeroAddress();
        address aToken = aTokens[asset];
        if (aToken == address(0)) revert AssetNotListed();

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        MockAToken(aToken).mint(onBehalfOf, amount);
        emit Supply(asset, onBehalfOf, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external whenNotPaused returns (uint256) {
        if (to == address(0)) revert ZeroAddress();
        address aToken = aTokens[asset];
        if (aToken == address(0)) revert AssetNotListed();

        uint256 balance = MockAToken(aToken).balanceOf(msg.sender);
        uint256 toWithdraw = amount == type(uint256).max ? balance : amount;
        if (toWithdraw == 0) revert ZeroAmount();
        if (toWithdraw > balance) revert InsufficientLiquidity();

        uint256 liquidity = IERC20(asset).balanceOf(address(this));
        if (toWithdraw > liquidity) revert InsufficientLiquidity();

        MockAToken(aToken).burn(msg.sender, toWithdraw);
        IERC20(asset).safeTransfer(to, toWithdraw);
        emit Withdraw(asset, to, toWithdraw);
        return toWithdraw;
    }

    /// @notice Credit simulated interest to an aToken holder (test operator only).
    /// @dev Requires the pool to hold extra underlying or mints aToken against unbacked reserve
    ///      for pure accounting tests. Prefer funding the pool first for withdrawable yield.
    function simulateYield(address asset, address onBehalfOf, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        address aToken = aTokens[asset];
        if (aToken == address(0)) revert AssetNotListed();
        MockAToken(aToken).simulateAccrue(onBehalfOf, amount);
        emit YieldSimulated(asset, onBehalfOf, amount);
    }
}
