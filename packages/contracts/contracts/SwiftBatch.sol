// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwiftBatchERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SwiftBatch {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_RECIPIENTS = 500;
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 10;

    address public owner;
    address public feeRecipient;

    event BatchPaymentSent(
        address indexed sender,
        address indexed token,
        uint256 recipientCount,
        uint256 grossAmount,
        uint256 feeAmount,
        address indexed feeRecipient
    );
    event FeeRecipientUpdated(address indexed previousFeeRecipient, address indexed nextFeeRecipient);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event RecipientPaid(address indexed sender, address indexed token, address indexed recipient, uint256 amount);

    error InvalidAmount();
    error InvalidArrayLength();
    error InvalidFeeRecipient();
    error InvalidRecipient();
    error InvalidToken();
    error NotOwner();
    error TooManyRecipients();
    error TokenTransferFailed();

    constructor(address initialFeeRecipient) {
        if (initialFeeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }

        owner = msg.sender;
        feeRecipient = initialFeeRecipient;

        emit OwnershipTransferred(address(0), msg.sender);
        emit FeeRecipientUpdated(address(0), initialFeeRecipient);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }

        _;
    }

    function sendBatch(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        if (token == address(0)) {
            revert InvalidToken();
        }

        uint256 recipientCount = recipients.length;

        if (recipientCount == 0 || recipientCount != amounts.length) {
            revert InvalidArrayLength();
        }

        if (recipientCount > MAX_RECIPIENTS) {
            revert TooManyRecipients();
        }

        uint256 grossAmount = 0;

        for (uint256 index = 0; index < recipientCount; index += 1) {
            if (recipients[index] == address(0)) {
                revert InvalidRecipient();
            }

            if (amounts[index] == 0) {
                revert InvalidAmount();
            }

            grossAmount += amounts[index];
        }

        uint256 feeAmount = (grossAmount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS;

        if (feeAmount > 0) {
            _safeTransferFrom(token, msg.sender, feeRecipient, feeAmount);
        }

        for (uint256 index = 0; index < recipientCount; index += 1) {
            _safeTransferFrom(token, msg.sender, recipients[index], amounts[index]);

            emit RecipientPaid(msg.sender, token, recipients[index], amounts[index]);
        }

        emit BatchPaymentSent(
            msg.sender,
            token,
            recipientCount,
            grossAmount,
            feeAmount,
            feeRecipient
        );
    }

    function setFeeRecipient(address nextFeeRecipient) external onlyOwner {
        if (nextFeeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }

        address previousFeeRecipient = feeRecipient;
        feeRecipient = nextFeeRecipient;

        emit FeeRecipientUpdated(previousFeeRecipient, nextFeeRecipient);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) {
            revert InvalidRecipient();
        }

        address previousOwner = owner;
        owner = nextOwner;

        emit OwnershipTransferred(previousOwner, nextOwner);
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (!ISwiftBatchERC20(token).transferFrom(from, to, amount)) {
            revert TokenTransferFailed();
        }
    }
}
