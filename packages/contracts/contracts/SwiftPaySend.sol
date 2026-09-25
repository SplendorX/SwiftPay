// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ISwiftPaySendERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ISwiftSaveVaultDepositFor {
    function depositFor(address owner, bytes32 pocketId, address token, uint256 amount) external;
}

/// @title SwiftPaySend
/// @notice Direct send with a 0.1% platform fee. When Spend&Save is on, the
///         savings deposit is included in the same transaction.
/// @dev Deploy a fresh instance on Arc mainnet. Fee recipient and token
///      addresses must come from official config — never testnet leftovers.
contract SwiftPaySend is Ownable2Step {
    uint256 public constant BASIS_POINTS = 10_000;
    /// @notice 0.1% platform fee (10 / 10_000 basis points).
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 10;

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

    error InvalidAmount();
    error InvalidFeeRecipient();
    error InvalidRecipient();
    error InvalidSave();
    error InvalidToken();
    error TokenTransferFailed();

    constructor(address initialOwner, address initialFeeRecipient) Ownable(initialOwner) {
        if (initialFeeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }

        feeRecipient = initialFeeRecipient;

        emit FeeRecipientUpdated(address(0), initialFeeRecipient);
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
            // Clear any allowance the vault didn't use, so nothing is left for it to pull later.
            if (!ISwiftPaySendERC20(token).approve(vault, 0)) {
                revert TokenTransferFailed();
            }
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


    /// @notice Recover tokens sent here by mistake. The contract never holds
    ///         user funds between calls, so anything here is a mis-send.
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        if (!ISwiftPaySendERC20(token).transfer(to, amount)) {
            revert TokenTransferFailed();
        }
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
