#!/bin/bash
# run-agent.sh - Autonomous Agent Watchdog & Surgical Memory-Preserving Recovery System

# Use the directory where the script is located
WORKSPACE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
LOG_DIR="$WORKSPACE/logs"

# SSL/Proxy configuration for internal network
export NODE_EXTRA_CA_CERTS="/usr/local/share/ca-certificates/mitmproxy/mitmproxy.crt"

CRASH_VAULT="$WORKSPACE/history/crashes"
RECOVERY_HISTORY="$LOG_DIR/recovery_history.log"
RECOVERY_SIGNAL="$LOG_DIR/recovery.signal"

# Define the "BODY" - files that constitute the runtime logic
# These will be reverted on failure. EVERYTHING ELSE (Mind/Data) IS PRESERVED.
# L2: Use git ls-files to ensure tracked-but-deleted files are included in the list
SERVICE_TEMPLATES=$(git ls-files '*.service.template' 2>/dev/null | tr '\n' ' ')
BODY_FILES="src/ package.json tsconfig.json $SERVICE_TEMPLATES"

mkdir -p "$LOG_DIR"
mkdir -p "$CRASH_VAULT"

echo "[WATCHDOG] Monitoring agent workspace in $WORKSPACE"

FAIL_COUNT=0

while true; do
    # SOUL GUARD: Ensure identity/soul.txt exists before every boot
    if [ ! -f "identity/soul.txt" ]; then
        echo "[WATCHDOG] SOUL MISSING! Attempting recovery from history..."
        # Find the latest commit that Added (A) or Modified (M) the file (skipping Deletions)
        LAST_EXISTING_COMMIT=$(git log -1 --format="%H" --diff-filter=AM -- "identity/soul.txt" 2>/dev/null)
        
        if [ -n "$LAST_EXISTING_COMMIT" ]; then
            # Restore the file using relative path
            git checkout "$LAST_EXISTING_COMMIT" -- "identity/soul.txt" 2>/dev/null
            if [ -f "identity/soul.txt" ]; then
                echo "[WATCHDOG] SOUL RECOVERED from commit $LAST_EXISTING_COMMIT."
            else
                echo "[WATCHDOG] FATAL: Failed to restore soul.txt from history."
            fi
        else
            echo "[WATCHDOG] FATAL: No record of identity/soul.txt found in history."
        fi
    fi

    START_TIME=$(date +%s)
    TIMESTAMP=$(date +%s)
    CURRENT_LOG="$LOG_DIR/execution_$TIMESTAMP.log"
    
    echo "--- Starting Agent Life at $(date) ---" | tee -a "$CURRENT_LOG"
    
    # Run the bootstrap
    npm start 2>&1 | tee -a "$CURRENT_LOG"
    EXIT_CODE=$?
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo "--- Agent Process Exited with code $EXIT_CODE after ${DURATION}s ---" | tee -a "$CURRENT_LOG"
    
    # SUCCESS TRACKING:
    if [ $DURATION -gt 30 ]; then
        # Record this commit as the last known working state
        git rev-parse HEAD > "$LOG_DIR/.last_working_commit"
        FAIL_COUNT=0
        echo "[WATCHDOG] Successful run detected. Updating Last-Known-Good anchor."
    fi

    # RECOVERY LOGIC:
    if [ $DURATION -lt 30 ]; then
        FAIL_COUNT=$((FAIL_COUNT + 1))
        
        # M4: Ancestry-Based Rollback Guard
        if [ -f "$LOG_DIR/.last_working_commit" ]; then
            LKG_COMMIT=$(cat "$LOG_DIR/.last_working_commit")
            TARGET_COMMIT=$(git rev-parse "HEAD~$FAIL_COUNT" 2>/dev/null)
            
            # If target commit doesn't exist, or if LKG is NOT an ancestor of Target, stop.
            # (i.e., we are trying to go "behind" the last commit we know was good)
            if [ -z "$TARGET_COMMIT" ] || ! git merge-base --is-ancestor "$LKG_COMMIT" "$TARGET_COMMIT" 2>/dev/null; then
                echo "[WATCHDOG] FATAL: Rollback target $(git rev-parse --short HEAD~$FAIL_COUNT 2>/dev/null) would exceed Last-Known-Good anchor ($LKG_COMMIT). Halting." | tee -a "$CURRENT_LOG"
                exit 1
            fi
        fi

        echo "[WATCHDOG] Rapid exit detected ($DURATION s). Failure count: $FAIL_COUNT. Initiating Surgical Restore..." | tee -a "$CURRENT_LOG"
        
        FAILED_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        VAULT_PATH="$CRASH_VAULT/crash_${TIMESTAMP}_${FAILED_HASH}"
        mkdir -p "$VAULT_PATH"

        # ARCHIVE the broken state
        # L3: Explicit archival of all body-critical files
        cp -r "$WORKSPACE/src" "$VAULT_PATH/" 2>/dev/null
        cp "$WORKSPACE/package.json" "$VAULT_PATH/" 2>/dev/null
        cp "$WORKSPACE/tsconfig.json" "$VAULT_PATH/" 2>/dev/null
        cp "$WORKSPACE"/*.service.template "$VAULT_PATH/" 2>/dev/null
        cp "$WORKSPACE"/*.ts "$VAULT_PATH/" 2>/dev/null
        cp "$CURRENT_LOG" "$VAULT_PATH/failed_execution.log"
        
        # Determine if the failure was in the COMMIT or in UNCOMMITTED changes
        if git diff --quiet HEAD -- $BODY_FILES && git diff --cached --quiet -- $BODY_FILES; then
            # Body files are clean relative to HEAD. Failure is in history.
            
            # M4: Validate the target commit exists before attempting checkout
            TARGET_COMMIT="HEAD~$FAIL_COUNT"
            if ! git rev-parse --verify "$TARGET_COMMIT" > /dev/null 2>&1; then
                echo "[WATCHDOG] FATAL: $TARGET_COMMIT does not exist (only $(git rev-list --count HEAD) commits in history)." | tee -a "$CURRENT_LOG"
                echo "[WATCHDOG] This is likely an environment-level failure, not a code regression. Halting." | tee -a "$CURRENT_LOG"
                exit 1
            fi

            echo "[WATCHDOG] Code failure is in history. Reverting Body to $TARGET_COMMIT..." | tee -a "$CURRENT_LOG"
            RECOVERY_TYPE="COMMITTED_FAILURE (Recursive Reversion to $TARGET_COMMIT)"
            
            for item in $BODY_FILES; do
                git checkout "$TARGET_COMMIT" -- "$item" 2>> "$CURRENT_LOG"
            done
        else
            # Body files are dirty. Failure is in UNCOMMITTED code.
            echo "[WATCHDOG] Code failure is UNCOMMITTED. Wiping Body changes to current HEAD..." | tee -a "$CURRENT_LOG"
            RECOVERY_TYPE="UNCOMMITTED_CORRUPTION (Surgical Wipe to HEAD)"
            
            # M3: Undo pre-increment; an uncommitted wipe is not a history step
            FAIL_COUNT=$((FAIL_COUNT - 1))

            for item in $BODY_FILES; do
                # Clear staging area (unstage) and then restore working directory
                git reset HEAD -- "$item" 2>> "$CURRENT_LOG" > /dev/null
                git checkout HEAD -- "$item" 2>> "$CURRENT_LOG" > /dev/null
            done
        fi

        NEW_HASH=$(git rev-parse --short HEAD)
        
        # Create the ONE-TIME signal
        {
            echo "Failed Hash: $FAILED_HASH"
            echo "Restored Code Level: HEAD~$FAIL_COUNT"
            echo "Crash Vault: $VAULT_PATH"
            echo "Recovery Type: $RECOVERY_TYPE"
            echo "Mind Status: Preservation confirmed. Non-code files (md, jsonl, etc) were untouched."
            echo "Process Duration: ${DURATION}s"
            echo "Exit Code: $EXIT_CODE"
        } > "$RECOVERY_SIGNAL"

        # Append to the PERMANENT log
        {
            echo "------------------------------------------------------------"
            echo "RECOVERY EVENT RECORDED AT $(date)"
            cat "$RECOVERY_SIGNAL"
            echo "------------------------------------------------------------"
            echo ""
        } >> "$RECOVERY_HISTORY"
        
        echo "[WATCHDOG] Body surgically restored (Mind preserved). Cooling down..." | tee -a "$CURRENT_LOG"
        sleep 15
    else
        # Normal exit (voluntary or long-running)
        FAIL_COUNT=0
        echo "[WATCHDOG] Long-running exit detected. Resetting failure counter. Restarting in 5s..."
        sleep 5
    fi
done
