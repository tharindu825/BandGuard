# 📡 BandGuard

**BandGuard** is a full-stack, hyper-accurate Internet Usage Tracker, Quota Manager, and Enforcement system tailored for Windows-based local area networks (LANs). 

It intelligently measures and restricts the *real* internet bandwidth used by PCs on a network, circumventing the common issue of local file transfers (SMB) distorting internet traffic statistics.

![BandGuard UI](./client/public/dashboard-preview.png) *(Preview placeholder)*

---

## 🌟 Key Features

### 1. 🛡️ True Internet Tracking (Smart Agent)
Unlike simple NIC-counting scripts, the BandGuard zero-footprint PowerShell agent (`v8.1+`) natively splits traffic:
- Evaluates real-time active **TCP & UDP** sessions.
- Automatically handles streaming traffic via modern **QUIC / HTTP3** protocols.
- Identifies and **totally ignores Local Area Network (LAN/SMB)** activity. You can transfer massive files across local drives without impacting your user quotas!
- Employs proportional prorating when users are doing heavy local transfers alongside active web usage.

### 2. 🚦 Self-Enforcement & Auto-Blocking
No need to tinker with complex router ACLs or RRAS setups. BandGuard controls traffic directly at the endpoint:
- **Dead-End Gateway Method**: When a user surpasses their assigned quota, the agent dynamically rewrites their Windows Default Gateway Route to a null IP (e.g., `192.168.1.11`).
- Instantly drops Internet access while keeping the local network connections (printers, shared drives, AD authentication) entirely intact and functional.

### 3. 📊 Elegant React Dashboard
A modern, dark-themed, glassmorphic UI built in React to view absolute data inside your LAN:
- Real-time auto-refreshing traffic metrics (every 30s).
- Detailed per-PC **Device Cards** showing visual utilization bars against set quotas, latest heartbeat timestamps, and live blocking status.
- Daily/Aggregate overview cards.

### 4. ⚙️ Central Quota Management
Manage bandwidth limits smoothly:
- Assign customizable limits per-device (Download MB, Upload MB, or Combined Total limit).
- Midnight resets or granular "flush usage" capabilities to reset daily tracking.
- Master SQLite robust database mapping all past history and audit logs of blocked events.

---

## 🏗️ Architecture

BandGuard is divided into three components:

1. **Central Server (`server/`)**: A fast `Node.js / Express` backend powered by `better-sqlite3`. Maintains all records and provides internal APIs for both the dashboard and the remote agents.
2. **Control Dashboard (`client/`)**: A `React / Vite` frontend delivered over the Central Server. Offers the GUI for admins to evaluate reports and impose limits.
3. **Endpoint Agent (`agent/`)**: An elevated `PowerShell` watcher configured to run silently as a Windows Scheduled Task (under the `SYSTEM` account context). Pings metrics every 15 seconds, and fetches updated status rules every 60 seconds.

---

## 🚀 Getting Started

### Setting Up the Server
1. Ensure **Node.js** (v18+) is installed on your designated central management box.
2. Install dependencies for the Server and Client:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
3. Build the Dashboard frontend:
   ```bash
   cd client
   npm run build
   ```
4. Start the Application: 
   Launch the `Start_Server.bat` file in the root directory (or run `node server.js` inside the server folder). The app will be alive on `http://YOUR_SERVER_IP:3000`.

### Deploying the Agent to Client PCs
1. Transport the `agent\` directory directly to the target Windows PC (via Flash Drive or SMB Share).
2. Right-click on `agent.bat` and select **Run as Administrator**.
3. (Optional Setup): Ensure you modify `SERVER_IP` at the top of the `agent.bat` to match your Node backend IP Address before deploying in bulk.
4. The `.bat` installer will configure the task, copy the scripts to `C:\NetAgent\`, execute tracking, and hide itself as an intrinsic system function.

### Setting Quotas
1. Visit `http://YOUR_SERVER_IP:3000` from any browser on your network.
2. Select your newly appeared device from the dashboard grid.
3. Expand **Set Quota** and define your limits (in MBs). Leave as `0` for Infinite/Unmetered access.

---

## 🛠 Troubleshooting

- **"Access Denied" or Agent Fails to Block:**
  The `agent.bat` module **must** be executed with Administrative elevation. Standard user limits will prevent the `SYSTEM` scheduled task creation or firewall modification.

- **False Positive Local Traffic Logging:**
  Ensure BandGuard's `Is-PrivateIP` mask aligns with your localized DHCP scopes. By default, standard RFC1918 `192.168.x.x`, `10.x.x.x`, and `172.16.x.x` blocks are exempted.

- **Reviewing Raw Logs:**
  Check `C:\NetAgent\errors.log` on the target remote client machine for telemetry or debug information.
