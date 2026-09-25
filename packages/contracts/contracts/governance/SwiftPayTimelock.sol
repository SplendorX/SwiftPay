// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title SwiftPayTimelock
/// @notice Owns every SwiftPay contract on mainnet. The multisig proposes and
///         executes; every change waits `minDelay` (48h) so users can react.
contract SwiftPayTimelock is TimelockController {
    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors)
        TimelockController(minDelay, proposers, executors, address(0))
    {}
}
