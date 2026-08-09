// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SwiftSaveVault
/// @notice Non-interest-bearing savings custody for Swift+Save pockets.
/// @dev Funds are segregated from spendable wallet balances. There is no yield,
///      APY, lending, borrowing, or DeFi return. Users may only withdraw their own
///      pocket balances. On-chain balances are the source of truth.
contract SwiftSaveVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Allowed stablecoins (USDC / EURC, etc.)
    mapping(address => bool) public allowedTokens;

    /// @notice owner => pocketId => token => balance (base units)
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public balances;

    /// @notice Aggregate locked per token for reconciliation
    mapping(address => uint256) public totalLocked;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroPocket();
    error TokenNotAllowed();
    error InsufficientPocketBalance();
    error TransferFailed();

    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event Deposited(
        address indexed owner,
        bytes32 indexed pocketId,
        address indexed token,
        uint256 amount
    );
    event Withdrawn(
        address indexed owner,
        bytes32 indexed pocketId,
        address indexed token,
        uint256 amount
    );

    constructor(address initialOwner, address[] memory initialTokens) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        for (uint256 i = 0; i < initialTokens.length; i++) {
            address token = initialTokens[i];
            if (token == address(0)) revert ZeroAddress();
            allowedTokens[token] = true;
            emit TokenAllowlistUpdated(token, true);
        }
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Deposit tokens into a savings pocket. Caller must approve this vault first.
    function deposit(
        bytes32 pocketId,
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (pocketId == bytes32(0)) revert ZeroPocket();
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!allowedTokens[token]) revert TokenNotAllowed();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        balances[msg.sender][pocketId][token] += amount;
        totalLocked[token] += amount;

        emit Deposited(msg.sender, pocketId, token, amount);
    }

    /// @notice Withdraw tokens from a savings pocket back to the caller's wallet.
    function withdraw(
        bytes32 pocketId,
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (pocketId == bytes32(0)) revert ZeroPocket();
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!allowedTokens[token]) revert TokenNotAllowed();

        uint256 available = balances[msg.sender][pocketId][token];
        if (available < amount) revert InsufficientPocketBalance();

        unchecked {
            balances[msg.sender][pocketId][token] = available - amount;
            totalLocked[token] -= amount;
        }

        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, pocketId, token, amount);
    }

    function pocketBalance(
        address owner,
        bytes32 pocketId,
        address token
    ) external view returns (uint256) {
        return balances[owner][pocketId][token];
    }

    /// @notice Rescue tokens that are not tracked as locked savings (mis-sends only).
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0) || token == address(0)) revert ZeroAddress();
        uint256 free = IERC20(token).balanceOf(address(this)) - totalLocked[token];
        if (amount > free) revert InsufficientPocketBalance();
        IERC20(token).safeTransfer(to, amount);
    }
}
