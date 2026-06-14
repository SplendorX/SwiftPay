// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PrivSwiftPayEscrow {
    struct Payment {
        address token;
        uint256 amount;
        bytes32 commitment;
        bool claimed;
    }

    mapping(bytes32 => Payment) public payments;

    event PaymentDeposited(bytes32 indexed paymentId, address indexed token, uint256 amount);
    event PaymentClaimed(bytes32 indexed paymentId, address indexed token, address indexed recipient, uint256 amount);

    error InvalidArrayLength();
    error InvalidAmount();
    error InvalidCommitment();
    error PaymentAlreadyExists();
    error PaymentAlreadyClaimed();
    error PaymentNotFound();
    error TokenTransferFailed();

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

        if (tokens.length != length || amounts.length != length || commitments.length != length) {
            revert InvalidArrayLength();
        }

        for (uint256 index = 0; index < length; index += 1) {
            _depositPayment(paymentIds[index], tokens[index], amounts[index], commitments[index]);
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

        bytes32 expectedCommitment = keccak256(abi.encodePacked(paymentId, secret, msg.sender));

        if (expectedCommitment != payment.commitment) {
            revert InvalidCommitment();
        }

        payment.claimed = true;

        if (!IERC20(payment.token).transfer(msg.sender, payment.amount)) {
            revert TokenTransferFailed();
        }

        emit PaymentClaimed(paymentId, payment.token, msg.sender, payment.amount);
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

        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
            delete payments[paymentId];
            revert TokenTransferFailed();
        }

        emit PaymentDeposited(paymentId, token, amount);
    }
}
