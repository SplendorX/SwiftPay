// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwiftPaySendERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface ISwiftSaveVaultDepositFor {
    function depositFor(address owner, bytes32 pocketId, address token, uint256 amount) external;
}

/// @title SwiftPaySend
/// @notice Direct send with a 0.1% platform fee. When Spend&Save is on, the
///         savings deposit is included in the same transaction.
/// @dev Deploy a fresh instance on Arc mainnet. Fee recipient and token
///      addresses must come from official config — never testnet leftovers.
contract SwiftPaySend {
    uint256 public constant BASIS_POINTS = 10_000;
    /// @notice 0.1% platform fee (10 / 10_000 basis points).
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 10;

    address public owner;
    address public feeRecipient;

    event PaymentSent(
        address indexed sender,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        uint256 feeAmount,
        uint256 saveAmount,
        address vault,
        bytes32 pocketId
    );
    event FeeRecipientUpdated(address indexed previousFeeRecipient, address indexed nextFeeRecipient);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);

    error InvalidAmount();
    error InvalidFeeRecipient();
    error InvalidRecipient();
    error InvalidSave();
    error InvalidToken();
    error NotOwner();
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

    function send(
        address token,
        address recipient,
        uint256 amount,
        address vault,
        bytes32 pocketId,
        uint256 saveAmount
    ) external {
        if (token == address(0)) {
            revert InvalidToken();
        }

        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        if (saveAmount > 0 && (vault == address(0) || pocketId == bytes32(0))) {
            revert InvalidSave();
        }

        uint256 feeAmount = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS;

        _safeTransferFrom(token, msg.sender, recipient, amount);

        if (feeAmount > 0) {
            _safeTransferFrom(token, msg.sender, feeRecipient, feeAmount);
        }

        if (saveAmount > 0) {
            _safeTransferFrom(token, msg.sender, address(this), saveAmount);
            if (!ISwiftPaySendERC20(token).approve(vault, saveAmount)) {
                revert TokenTransferFailed();
            }
            ISwiftSaveVaultDepositFor(vault).depositFor(msg.sender, pocketId, token, saveAmount);
        }

        emit PaymentSent(
            msg.sender,
            token,
            recipient,
            amount,
            feeAmount,
            saveAmount,
            vault,
            pocketId
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
        if (!ISwiftPaySendERC20(token).transferFrom(from, to, amount)) {
            revert TokenTransferFailed();
        }
    }
}
