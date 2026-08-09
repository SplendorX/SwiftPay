// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title EarnAutoSaveExecutor
/// @notice Pulls user-approved USDC and deposits into SwiftPayVault for the user.
/// @dev Requires explicit USDC allowance from the user to this contract.
///      Operator is intended for multisig/automation — never a silent fund drain.
contract EarnAutoSaveExecutor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC4626 public immutable vault;
    address public operator;

    mapping(bytes32 => bool) public consumedExecutionIds;

    error ZeroAddress();
    error ZeroAmount();
    error NotOperator();
    error AlreadyExecuted();
    error InvalidVaultAsset();

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event AutoSaveExecuted(
        bytes32 indexed executionId,
        address indexed user,
        uint256 assets,
        uint256 shares
    );

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address usdc_, address vault_, address operator_, address owner_) Ownable(owner_) {
        if (usdc_ == address(0) || vault_ == address(0) || operator_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (IERC4626(vault_).asset() != usdc_) {
            revert InvalidVaultAsset();
        }

        usdc = IERC20(usdc_);
        vault = IERC4626(vault_);
        operator = operator_;
    }

    function setOperator(address nextOperator) external onlyOwner {
        if (nextOperator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(operator, nextOperator);
        operator = nextOperator;
    }

    /// @notice Pull `amount` USDC from `user` (allowance required) and deposit into vault for `user`.
    function executeAutoSave(
        bytes32 executionId,
        address user,
        uint256 amount
    ) external onlyOperator nonReentrant returns (uint256 shares) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (consumedExecutionIds[executionId]) revert AlreadyExecuted();

        consumedExecutionIds[executionId] = true;

        usdc.safeTransferFrom(user, address(this), amount);
        usdc.forceApprove(address(vault), amount);
        shares = vault.deposit(amount, user);
        usdc.forceApprove(address(vault), 0);

        emit AutoSaveExecuted(executionId, user, amount, shares);
    }
}
