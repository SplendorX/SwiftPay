// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IYieldStrategy
/// @notice Isolates SwiftPayVault from underlying DeFi protocols.
/// @dev The vault is the sole authorized caller for deposit/withdraw/harvest.
interface IYieldStrategy {
    /// @notice Deploy `amount` of underlying asset into the yield venue.
    /// @dev Caller must have transferred assets to the strategy first, or strategy pulls via transferFrom.
    function deposit(uint256 amount) external;

    /// @notice Withdraw `amount` of underlying asset to the vault.
    /// @return withdrawn Actual amount sent to the vault.
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice Total underlying assets controlled by this strategy.
    function totalAssets() external view returns (uint256);

    /// @notice Optional explicit harvest/compound. May be a no-op if interest auto-accrues.
    /// @return harvested Gross yield realized by this call (0 if passive accrual).
    function harvest() external returns (uint256 harvested);

    /// @notice Pull all capital back to the vault (emergency).
    /// @return withdrawn Amount returned to the vault.
    function emergencyWithdraw() external returns (uint256 withdrawn);

    /// @notice Human-readable strategy identifier.
    function strategyName() external view returns (string memory);

    /// @notice Whether the strategy is healthy enough to accept new capital.
    function isHealthy() external view returns (bool);

    /// @notice Underlying ERC-20 asset (USDC).
    function asset() external view returns (address);

    /// @notice Vault authorized to call mutating functions.
    function vault() external view returns (address);
}
