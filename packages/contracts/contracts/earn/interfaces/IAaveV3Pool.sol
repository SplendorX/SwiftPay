// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Minimal Aave V3 Pool interface used by SwiftPay Earn.
/// @dev Compatible with Aave V3 `Pool.sol` supply/withdraw entrypoints.
///      When Arc mainnet ships Aave (V3-style or a V4 adapter with the same surface),
///      point `AaveUsdcYieldStrategy` at the verified Pool + aToken addresses via env.
interface IAaveV3Pool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    function getReserveAToken(address asset) external view returns (address);
}

/// @notice Minimal aToken surface (Aave interest-bearing receipt).
interface IAToken {
    function balanceOf(address account) external view returns (uint256);

    function UNDERLYING_ASSET_ADDRESS() external view returns (address);

    function POOL() external view returns (address);

    function scaledBalanceOf(address user) external view returns (uint256);
}
