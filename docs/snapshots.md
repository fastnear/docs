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

CHATGPT HERE!
The instructions below utilize logic from this FastNEAR repository: <a href="https://github.com/fastnear/static" target="_blank">https://github.com/fastnear/static</a>


## Mainnet

### Snapshot (pruned)

**Note**: this is likely the preferred approach for syncing, as opposed to downloading an archival snapshot, which is significantly larger and more special-purpose.

Run this command to download and execute the shell script.

We've added the environment variable `DATA_PATH` to point to a local directory we've created, overriding the default destination location: `/root`

The `CHAIN_ID` env var defaults to `mainnet`, so we omit it.

{% admonition type="info" name="Review full command, copy below:" %}
  &nbsp;    
  <code>curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | DATA_PATH=~/mainnet-snap sh</code>
{% /admonition %}        

``` {% title="mainnet snapshot » ~/mainnet-snap" %}
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | DATA_PATH=~/mainnet-snap sh
```

### Archival snapshot

{% admonition type="warning" %}
  Be prepared for a large download and the inherent time constraints involved.
{% /admonition %}     

  Here, the `DATA_PATH` environment variable sets the destination download directory to `~/mainnet-snap-archival`

  {% admonition type="info" name="Review full command, copy below:" %}
    &nbsp;    
    <code>curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | DATA_PATH=~/mainnet-snap-archival sh</code>
  {% /admonition %}        

  ``` {% title="mainnet archive » ~/mainnet-snap-archival" %}
  curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | DATA_PATH=~/mainnet-snap-archival sh
  ```

## Testnet

### Snapshot (pruned)

  Environment variables:

   - `DATA_PATH` sets the destination download directory to `~/testnet-snap`
   - `CHAIN_ID` sets the blockchain network to `testnet` (default is `mainnet`)

  {% admonition type="info" name="Review full command, copy below:" %}
    &nbsp;    
    <code>curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | CHAIN_ID=testnet DATA_PATH=~/testnet-snap sh</code>
  {% /admonition %}        

  ``` {% title="testnet snapshot » ~/testnet-snap" %}
  curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone.sh | CHAIN_ID=testnet DATA_PATH=~/testnet-snap-archival sh
  ```


<!-- ### Archival snapshot

  Environment variables:

    - `DATA_PATH` sets the destination download directory to `~/testnet-snap-archival`
    - `CHAIN_ID` sets the blockchain network to `testnet` (default is `mainnet`

  {% admonition type="info" name="Review full command, copy below:" %}
    &nbsp;    
    <code>curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | CHAIN_ID=testnet DATA_PATH=~/testnet-snap-archival sh</code>
  {% /admonition %}        

  ``` {% title="testnet archive » ~/testnet-snap-archival" %}
  curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/fastnear/static/refs/heads/main/down_rclone_archival.sh | CHAIN_ID=testnet DATA_PATH=~/testnet-snap-archival sh
  ``` -->
