// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VaultMath
/// @notice Safe share/asset conversion helpers (no floating point).
library VaultMath {
    uint256 internal constant BPS = 10_000;

    error ZeroAmount();
    error MathOverflow();

    function mulDiv(
        uint256 a,
        uint256 b,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        if (denominator == 0) {
            revert MathOverflow();
        }
        unchecked {
            uint256 prod = a * b;
            if (a != 0 && prod / a != b) {
                revert MathOverflow();
            }
            result = prod / denominator;
        }
    }

    /// @notice Performance fee on positive yield only.
    function performanceFee(
        uint256 grossYield,
        uint256 feeBps
    ) internal pure returns (uint256 fee) {
        if (grossYield == 0 || feeBps == 0) {
            return 0;
        }
        return mulDiv(grossYield, feeBps, BPS);
    }
}
