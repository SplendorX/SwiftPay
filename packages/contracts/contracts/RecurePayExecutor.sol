// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwiftRecurepayERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Pulls approved stablecoin transfers for SwiftRecurepay autopay runs.
/// @dev Charges a 1% platform fee (same rate as SwiftBatch) to feeRecipient.
contract SwiftRecurepayExecutor {
    uint256 public constant BASIS_POINTS = 10_000;
    /// @notice 1% platform fee (100 / 10_000 basis points).
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 100;

    address public owner;
    address public operator;
    address public feeRecipient;

    mapping(bytes32 => bool) public consumedExecutionIds;

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event FeeRecipientUpdated(address indexed previousFeeRecipient, address indexed nextFeeRecipient);
    event RecurringPaymentExecuted(
        bytes32 indexed executionId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 feeAmount,
        address feeRecipient
    );

    error AlreadyExecuted();
    error InvalidOperator();
    error InvalidFeeRecipient();
    error InvalidRecipient();
    error InvalidToken();
    error NotOperator();
    error NotOwner();
    error TransferFailed();

    constructor(address initialOperator, address initialFeeRecipient) {
        if (initialOperator == address(0)) {
            revert InvalidOperator();
        }
        if (initialFeeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }

        owner = msg.sender;
        operator = initialOperator;
        feeRecipient = initialFeeRecipient;

        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorUpdated(address(0), initialOperator);
        emit FeeRecipientUpdated(address(0), initialFeeRecipient);
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

    function setFeeRecipient(address nextFeeRecipient) external onlyOwner {
        if (nextFeeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }

        emit FeeRecipientUpdated(feeRecipient, nextFeeRecipient);
        feeRecipient = nextFeeRecipient;
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

        uint256 feeAmount = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS;

        if (feeAmount > 0) {
            bool feeTransferred = ISwiftRecurepayERC20(token).transferFrom(
                payer,
                feeRecipient,
                feeAmount
            );
            if (!feeTransferred) {
                revert TransferFailed();
            }
        }

        bool transferred = ISwiftRecurepayERC20(token).transferFrom(payer, recipient, amount);

        if (!transferred) {
            revert TransferFailed();
        }

        emit RecurringPaymentExecuted(
            executionId,
            payer,
            recipient,
            token,
            amount,
            feeAmount,
            feeRecipient
        );
    }
}