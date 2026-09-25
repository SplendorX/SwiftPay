// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GuardedOwnable
/// @notice Two-step ownership plus a guardian that can only pause.
/// @dev On mainnet the owner is a TimelockController run by a multisig, so
///      every privileged change is announced 48h ahead. The guardian is the
///      multisig itself, so an incident can be stopped at once — but pausing
///      never moves funds, and only the (timelocked) owner can unpause.
abstract contract GuardedOwnable is Ownable2Step, Pausable {
    address public guardian;

    event GuardianUpdated(address indexed previousGuardian, address indexed nextGuardian);

    error NotGuardian();

    constructor(address initialOwner, address initialGuardian) Ownable(initialOwner) {
        guardian = initialGuardian;
        emit GuardianUpdated(address(0), initialGuardian);
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _;
    }

    function setGuardian(address nextGuardian) external onlyOwner {
        emit GuardianUpdated(guardian, nextGuardian);
        guardian = nextGuardian;
    }

    function pause() external onlyGuardianOrOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
