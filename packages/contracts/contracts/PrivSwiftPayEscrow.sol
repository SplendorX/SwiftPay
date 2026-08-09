// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Claim-code escrow for PrivSwiftPay confidential payments.
/// @dev Charges a 1% platform fee (same rate as SwiftBatch / SwiftRecurepay) on deposit.
///      The stored payment amount is the full claim amount; the fee is pulled separately.
contract PrivSwiftPayEscrow {
    uint256 public constant BASIS_POINTS = 10_000;
    /// @notice 1% platform fee (100 / 10_000 basis points).
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 100;

    struct Payment {
        address token;
        uint256 amount;
        bytes32 commitment;
        bool claimed;
    }

    mapping(bytes32 => Payment) public payments;

    address public owner;
    address public feeRecipient;

    event PaymentDeposited(
        bytes32 indexed paymentId,
        address indexed token,
        uint256 amount,
        uint256 feeAmount,
        address indexed feeRecipient
    );
    event PaymentClaimed(
        bytes32 indexed paymentId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event FeeRecipientUpdated(
        address indexed previousFeeRecipient,
        address indexed nextFeeRecipient
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed nextOwner
    );

    error InvalidArrayLength();
    error InvalidAmount();
    error InvalidCommitment();
    error InvalidFeeRecipient();
    error NotOwner();
    error PaymentAlreadyExists();
    error PaymentAlreadyClaimed();
    error PaymentNotFound();
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

    function depositPayment(
        bytes32 paymentId,
        address token,
        uint256 amount,
        bytes32 commitment
    ) public {
        _depositPayment(paymentId, token, amount, commitment);
    }

    function depositPayments(
        bytes32[] calldata paymentIds,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata commitments
    ) external {
        uint256 length = paymentIds.length;

        if (
            tokens.length != length ||
            amounts.length != length ||
            commitments.length != length
        ) {
            revert InvalidArrayLength();
        }

        for (uint256 index = 0; index < length; index += 1) {
            _depositPayment(
                paymentIds[index],
                tokens[index],
                amounts[index],
                commitments[index]
            );
        }
    }

    function claimPayment(bytes32 paymentId, bytes32 secret) external {
        Payment storage payment = payments[paymentId];

        if (payment.amount == 0) {
            revert PaymentNotFound();
        }

        if (payment.claimed) {
            revert PaymentAlreadyClaimed();
        }

        bytes32 expectedCommitment = keccak256(
            abi.encodePacked(paymentId, secret, msg.sender)
        );

        if (expectedCommitment != payment.commitment) {
            revert InvalidCommitment();
        }

        payment.claimed = true;

        if (!IERC20(payment.token).transfer(msg.sender, payment.amount)) {
            revert TokenTransferFailed();
        }

        emit PaymentClaimed(paymentId, payment.token, msg.sender, payment.amount);
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
            revert InvalidFeeRecipient();
        }

        address previousOwner = owner;
        owner = nextOwner;

        emit OwnershipTransferred(previousOwner, nextOwner);
    }

    function _depositPayment(
        bytes32 paymentId,
        address token,
        uint256 amount,
        bytes32 commitment
    ) internal {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (commitment == bytes32(0)) {
            revert InvalidCommitment();
        }

        if (payments[paymentId].amount != 0) {
            revert PaymentAlreadyExists();
        }

        payments[paymentId] = Payment({
            token: token,
            amount: amount,
            commitment: commitment,
            claimed: false
        });

        uint256 feeAmount = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS;

        if (feeAmount > 0) {
            if (!IERC20(token).transferFrom(msg.sender, feeRecipient, feeAmount)) {
                delete payments[paymentId];
                revert TokenTransferFailed();
            }
        }

        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
            delete payments[paymentId];
            revert TokenTransferFailed();
        }

        emit PaymentDeposited(paymentId, token, amount, feeAmount, feeRecipient);
    }
}
