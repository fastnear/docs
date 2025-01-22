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

<!-- {% admonition type="info" %}
  MD5 hash verification will be available shortly.<br/>
  _(Certainly by end of year, 2024)_
{% /admonition %} -->

The instructions below utilize logic from this FastNEAR repository: <a href="https://github.com/fastnear/static" target="_blank">https://github.com/fastnear/static</a>

## Mainnet

### Optimized Mainnet Snapshot

{% admonition type="info" name="" %}
**Note**: This is likely the preferred approach for syncing, as opposed to downloading an archival snapshot, which is significantly larger and more special-purpose.
{% /admonition %}

Nodes with sufficient resources can take advantage of setting the `$RPC_TYPE` flag to `fast-rpc`. (Default is `rpc`)

Make sure you have `rclone` installed. Install it by running:

```bash {% title="rclone installation" %}
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

Before running the snapshot download script, you can set the following environment variables:

- `CHAIN_ID` to either `mainnet` or `testnet`. (default: `mainnet`)
- `RPC_TYPE` to either `rpc` (default) or `fast-rpc`
- `THREADS` to the number of threads you want to use for downloading. Use `128` for 10Gbps, and `16` for 1Gbps (default: `128`).
- `TPSLIMIT` to the maximum number of HTTP new actions per second. (default: `4096`)
- `BWLIMIT` to the maximum bandwidth to use for download in case you want to limit it. (default: `10G`)
- `DATA_PATH` to the path where you want to download the snapshot (default: `~/.near/data`)
- `BLOCK` to the block height of the snapshot you want to download. If not set, it will download the latest snapshot.

**Run this command to download the RPC Mainnet snapshot:**

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_PATH=~/.near/data` - the standard nearcore path
- `CHAIN_ID=mainnet` - to explicitly specify the mainnet data
  {% /admonition %}

```bash {% title="RPC Mainnet Snapshot » ~/.near/data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | DATA_PATH=~/.near/data CHAIN_ID=mainnet RPC_TYPE=fast-rpc bash
```

### RPC Mainnet Snapshot

This is the standard method to obtain a snapshot without the high performance from the previous section covering optimized snapshots. 

Make sure you have `rclone` installed. Install it by running:

```bash {% title="rclone installation" %}
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

Before running the snapshot download script, you can set the following environment variables:

- `CHAIN_ID` to either `mainnet` or `testnet`. (default: `mainnet`)
- `RPC_TYPE` to either `rpc` (default) or `fast-rpc`
- `THREADS` to the number of threads you want to use for downloading. Use `128` for 10Gbps, and `16` for 1Gbps (default: `128`).
- `TPSLIMIT` to the maximum number of HTTP new actions per second. (default: `4096`)
- `BWLIMIT` to the maximum bandwidth to use for download in case you want to limit it. (default: `10G`)
- `DATA_PATH` to the path where you want to download the snapshot (default: `~/.near/data`)
- `BLOCK` to the block height of the snapshot you want to download. If not set, it will download the latest snapshot.

**Run this command to download the RPC Mainnet snapshot:**

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_PATH=~/.near/data` - the standard nearcore path
- `CHAIN_ID=mainnet` - to explicitly specify the mainnet data
{% /admonition %}

```bash {% title="RPC Mainnet Snapshot » ~/.near/data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | DATA_PATH=~/.near/data CHAIN_ID=mainnet bash
```

### Archival Mainnet snapshot

{% admonition type="warning" name="" %}
**Time and storage intensive.**

Be prepared for a large download and the inherent time constraints involved.

The snapshot size is ~60Tb and contains more than 1M files.
{% /admonition %}

{% admonition type="danger" name="" %}
**Work in progress**

The archival snapshots are work in progress. We are updating the docs and the scripts to make it easier to download.
One concern is the snapshot `BLOCK` has to be the same between hot and cold data runs.
Also you have to run script twice to download hot and cold data.
{% /admonition %}

Make sure you have `rclone` installed. Install it by running:

```bash {% title="rclone installation" %}
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

Before running the download script, you can set the following environment variables:

- `CHAIN_ID` to either `mainnet` or `testnet`. (default: `mainnet`)
- `THREADS` to the number of threads you want to use for downloading. Use `128` for 10Gbps, and `16` for 1Gbps (default: `128`).
- `TPSLIMIT` to the maximum number of HTTP new actions per second. (default: `4096`)
- `DATA_TYPE` to either `hot-data` or `cold-data` (default: `cold-data`)
- `BWLIMIT` to the maximum bandwidth to use for download in case you want to limit it. (default: `10G`)
- `DATA_PATH` to the path where you want to download the snapshot (default: `/mnt/nvme/data/$DATA_TYPE`)
- `BLOCK` to the block height of the snapshot you want to download. If not set, it will download the latest snapshot.

By default the script assumes the paths for the data:
- Hot data (has to be on NVME): `/mnt/nvme/data/hot-data`
- Cold data (can be on HDDs): `/mnt/nvme/data/cold-data`


**Run the following commands to download the Archival Mainnet snapshot:**

1. Download the latest snapshot block height:

```bash {% title="Latest archival mainnet snapshot block" %}
LATEST=$(curl -s "https://snapshot.neardata.xyz/mainnet/archival/latest.txt")
echo "Latest snapshot block: $LATEST"
```

2. Download the HOT data from the snapshot. It has to be placed on NVME.

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_TYPE=hot-data` - downloads the Hot data
- `DATA_PATH=~/.near/data` - the standard nearcore path
- `CHAIN_ID=mainnet` - to explicitly specify the mainnet data
- `BLOCK=$LATEST` - specify the snapshot block
{% /admonition %}

```bash {% title="Archival Mainnet Snapshot (hot-data) » ~/.near/data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | DATA_TYPE=hot-data DATA_PATH=~/.near/data CHAIN_ID=mainnet BLOCK=$LATEST bash
```

3. Download the COLD data from the snapshot. It can be placed on HDDs.

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_TYPE=cold-data` - downloads the Hot data
- `DATA_PATH=/mnt/hdds/cold-data` - the path where to place cold data. **Note**: the nearcore config should point cold data store to the same path.
- `CHAIN_ID=mainnet` - to explicitly specify the mainnet data
- `BLOCK=$LATEST` - specify the snapshot block
{% /admonition %}

```bash {% title="Archival Mainnet Snapshot (cold-data) » /mnt/hdds/cold-data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | DATA_TYPE=cold-data DATA_PATH=/mnt/hdds/cold-data CHAIN_ID=mainnet BLOCK=$LATEST bash
```

## Testnet

### RPC Testnet Snapshot

{% admonition type="info" name="" %}
**Note**: This is likely the preferred approach for syncing, as opposed to downloading an archival snapshot, which is significantly larger and more special-purpose.
{% /admonition %}

Make sure you have `rclone` installed. Install it by running:

```bash {% title="rclone installation" %}
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

Before running the snapshot download script, you can set the following environment variables:

- `CHAIN_ID` to either `mainnet` or `testnet`. (default: `mainnet`)
- `THREADS` to the number of threads you want to use for downloading. Use `128` for 10Gbps, and `16` for 1Gbps (default: `128`).
- `TPSLIMIT` to the maximum number of HTTP new actions per second. (default: `4096`)
- `BWLIMIT` to the maximum bandwidth to use for download in case you want to limit it. (default: `10G`)
- `DATA_PATH` to the path where you want to download the snapshot (default: `~/.near/data`)
- `BLOCK` to the block height of the snapshot you want to download. If not set, it will download the latest snapshot.

**Run this command to download the RPC Testnet snapshot:**

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_PATH=~/.near/data` - the standard nearcore path
- `CHAIN_ID=testnet` - to explicitly specify the testnet data
{% /admonition %}

```bash {% title="RPC Testnet Snapshot » ~/.near/data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | DATA_PATH=~/.near/data CHAIN_ID=testnet bash
```

### Archival Testnet snapshot

{% admonition type="warning" name="" %}
**Time and storage intensive.**

Be prepared for a large download and the inherent time constraints involved.
{% /admonition %}

{% admonition type="danger" name="" %}
**Work in progress**

The archival snapshots are work in progress. We are updating the docs and the scripts to make it easier to download.
One concern is the snapshot `BLOCK` has to be the same between hot and cold data runs.
Also you have to run script twice to download hot and cold data.
{% /admonition %}

Make sure you have `rclone` installed. Install it by running:

```bash {% title="rclone installation" %}
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

Before running the download script, you can set the following environment variables:

- `CHAIN_ID` to either `mainnet` or `testnet`. (default: `mainnet`)
- `THREADS` to the number of threads you want to use for downloading. Use `128` for 10Gbps, and `16` for 1Gbps (default: `128`).
- `TPSLIMIT` to the maximum number of HTTP new actions per second. (default: `4096`)
- `DATA_TYPE` to either `hot-data` or `cold-data` (default: `cold-data`)
- `BWLIMIT` to the maximum bandwidth to use for download in case you want to limit it. (default: `10G`)
- `DATA_PATH` to the path where you want to download the snapshot (default: `/mnt/nvme/data/$DATA_TYPE`)
- `BLOCK` to the block height of the snapshot you want to download. If not set, it will download the latest snapshot.

By default the script assumes the paths for the data:
- Hot data (has to be on NVME): `/mnt/nvme/data/hot-data`

**Run the following commands to download the Archival Testnet snapshot:**

1. Download the latest snapshot block height:

```bash {% title="Latest archival testnet snapshot block" %}
LATEST=$(curl -s "https://snapshot.neardata.xyz/testnet/archival/latest.txt")
echo "Latest snapshot block: $LATEST"
```

2. Download the HOT data from the snapshot. It has to be placed on NVME.

{% admonition type="info" name="" %}
We will set the following environment variables:
- `DATA_TYPE=hot-data` - downloads the Hot data
- `DATA_PATH=~/.near/data` - the standard nearcore path
- `CHAIN_ID=testnet` - set to testnet network
- `BLOCK=$LATEST` - specify the snapshot block
  {% /admonition %}

```bash {% title="Archival Testnet Snapshot (hot-data) » ~/.near/data" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | DATA_TYPE=hot-data DATA_PATH=~/.near/data CHAIN_ID=testnet BLOCK=$LATEST bash
```
