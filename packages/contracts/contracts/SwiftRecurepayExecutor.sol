// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwiftRecurepayERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Pulls approved stablecoin transfers for SwiftRecurepay autopay runs.
contract SwiftRecurepayExecutor {
    address public owner;
    address public operator;

    mapping(bytes32 => bool) public consumedExecutionIds;

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event RecurringPaymentExecuted(
        bytes32 indexed executionId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount
    );

    error AlreadyExecuted();
    error InvalidOperator();
    error InvalidRecipient();
    error InvalidToken();
    error NotOperator();
    error NotOwner();
    error TransferFailed();

    constructor(address initialOperator) {
        if (initialOperator == address(0)) {
            revert InvalidOperator();
        }

        owner = msg.sender;
        operator = initialOperator;

        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorUpdated(address(0), initialOperator);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) {
            revert NotOperator();
        }
        _;
    }

    function setOperator(address nextOperator) external onlyOwner {
        if (nextOperator == address(0)) {
            revert InvalidOperator();
        }

        emit OperatorUpdated(operator, nextOperator);
        operator = nextOperator;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) {
            revert NotOwner();
        }

        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function executeRecurringPayment(
        bytes32 executionId,
        address token,
        address payer,
        address recipient,
        uint256 amount
    ) external onlyOperator {
        if (token == address(0) || payer == address(0) || recipient == address(0)) {
            revert InvalidToken();
        }

        if (amount == 0) {
            revert TransferFailed();
        }

        if (consumedExecutionIds[executionId]) {
            revert AlreadyExecuted();
        }

        consumedExecutionIds[executionId] = true;

        bool transferred = ISwiftRecurepayERC20(token).transferFrom(payer, recipient, amount);

        if (!transferred) {
            revert TransferFailed();
        }

        emit RecurringPaymentExecuted(executionId, payer, recipient, token, amount);
    }
}