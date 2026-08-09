// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal interest-bearing receipt used with MockAavePool (testnet/local only).
contract MockAToken is ERC20 {
    using SafeERC20 for IERC20;

    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public immutable POOL;
    uint8 private immutable _tokenDecimals;

    error OnlyPool();

    modifier onlyPool() {
        if (msg.sender != POOL) revert OnlyPool();
        _;
    }

    constructor(
        address underlying_,
        address pool_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        UNDERLYING_ASSET_ADDRESS = underlying_;
        POOL = pool_;
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }

    /// @notice Simulate organic interest accrual for UI/integration tests.
    /// @dev Marked for simulation environments only — never represents real yield.
    function simulateAccrue(address account, uint256 amount) external onlyPool {
        _mint(account, amount);
    }

    function scaledBalanceOf(address user) external view returns (uint256) {
        return balanceOf(user);
    }
}
