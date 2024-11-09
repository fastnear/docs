---
markdown:
  toc:
    header: "Jump to"
    depth: 3
breadcrumbs:
  hide: true
---

# Blockchain snapshots

Download blockchains state in order to set up a validator node or RPC. See <a href="https://github.com/near/nearcore?tab=readme-ov-file#about-near" target="_blank">nearcore</a> for more information on node requirements and usage.

Also, visit <a href="https://near-nodes.io" target="_blank">https://near-nodes.io</a> for comprehensive details.

{% admonition type="info" %}
  MD5 hash verification will be available shortly.<br/>
  _(By end of year, 2024)_
{% /admonition %}

## Mainnet

1. Create `download-mainnet-snapshot.sh` and paste the code below.

    ```
    nano download-mainnet-snapshot.sh
    ```
2. Make executable

   ```
   chmod +ux download-mainnet-snapshot.sh
   ```

3. Run (shows use of local destination path)

   ```
   DATA_PATH=~/mainnet-snap ./download-mainnet-snapshot.sh
   ```

### Code

```sh
set -e

# The script downloads the latest RPC snapshot from the FASTNEAR snapshot server.
# It uses rclone for parallel downloads and retries failed downloads.
#
# Instructions:
# - Make sure you have rclone installed, e.g. using `apt install rclone`
# - Set $DATA_PATH to the path where you want to download the snapshot (default: /root/.near/data)
# - Set $THREADS to the number of threads you want to use for downloading (default: 16).

if ! command -v rclone &> /dev/null
then
    echo "rclone is not installed. Please install it and try again."
    exit 1
fi

HTTP_URL="https://snapshot.neardata.xyz"
PREFIX="mainnet/rpc"
: "${THREADS:=16}"
: "${DATA_PATH:=/root/.near/data}"

main() {
  mkdir -p "$DATA_PATH"
  LATEST=$(curl -s "$HTTP_URL/$PREFIX/latest.txt")
  echo "Latest snapshot block: $LATEST"

  FILES_PATH="/tmp/files.txt"
  curl -s "$HTTP_URL/$PREFIX/$LATEST/files.txt" -o $FILES_PATH

  EXPECTED_NUM_FILES=$(wc -l < $FILES_PATH)
  echo "Downloading $EXPECTED_NUM_FILES files with $THREADS threads"

  rclone copy \
    --no-traverse \
    --http-no-head \
    --transfers $THREADS \
    --checkers $THREADS \
    --buffer-size 128M \
    --http-url $HTTP_URL \
    --files-from=$FILES_PATH \
    --retries 10 \
    --retries-sleep 1s \
    --low-level-retries 10 \
    --progress \
    :http:$PREFIX/$LATEST/ $DATA_PATH

  ACTUAL_NUM_FILES=$(find $DATA_PATH -type f | wc -l)
  echo "Downloaded $ACTUAL_NUM_FILES files, expected $EXPECTED_NUM_FILES"

  if [[ $ACTUAL_NUM_FILES -ne $EXPECTED_NUM_FILES ]]; then
    echo "Error: Downloaded files count mismatch"
    exit 1
  fi
}

main "$@"
```

## Testnet

1. Create `download-testnet-snapshot.sh` and paste the code below.

    ```
    nano download-testnet-snapshot.sh
    ```
2. Make executable

   ```
   chmod +ux download-testnet-snapshot.sh
   ```

3. Run (shows use of local destination path)

   ```
   DATA_PATH=~/testnet-snap ./download-testnet-snapshot.sh
   ```

### Code

```sh
set -e

# The script downloads the latest RPC snapshot from the FASTNEAR snapshot server.
# It uses rclone for parallel downloads and retries failed downloads.
#
# Instructions:
# - Make sure you have rclone installed, e.g. using `apt install rclone`
# - Set $DATA_PATH to the path where you want to download the snapshot (default: /root/.near/data)
# - Set $THREADS to the number of threads you want to use for downloading (default: 16).

if ! command -v rclone &> /dev/null
then
    echo "rclone is not installed. Please install it and try again."
    exit 1
fi

HTTP_URL="https://snapshot.neardata.xyz"
PREFIX="testnet/rpc"
: "${THREADS:=16}"
: "${DATA_PATH:=/root/.near/data}"

main() {
  mkdir -p "$DATA_PATH"
  LATEST=$(curl -s "$HTTP_URL/$PREFIX/latest.txt")
  echo "Latest snapshot block: $LATEST"

  FILES_PATH="/tmp/files.txt"
  curl -s "$HTTP_URL/$PREFIX/$LATEST/files.txt" -o $FILES_PATH

  EXPECTED_NUM_FILES=$(wc -l < $FILES_PATH)
  echo "Downloading $EXPECTED_NUM_FILES files with $THREADS threads"

  rclone copy \
    --no-traverse \
    --http-no-head \
    --transfers $THREADS \
    --checkers $THREADS \
    --buffer-size 128M \
    --http-url $HTTP_URL \
    --files-from=$FILES_PATH \
    --retries 10 \
    --retries-sleep 1s \
    --low-level-retries 10 \
    --progress \
    :http:$PREFIX/$LATEST/ $DATA_PATH

  ACTUAL_NUM_FILES=$(find $DATA_PATH -type f | wc -l)
  echo "Downloaded $ACTUAL_NUM_FILES files, expected $EXPECTED_NUM_FILES"

  if [[ $ACTUAL_NUM_FILES -ne $EXPECTED_NUM_FILES ]]; then
    echo "Error: Downloaded files count mismatch"
    exit 1
  fi
}

main "$@"
```

