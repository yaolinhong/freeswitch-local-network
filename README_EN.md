# FreeSWITCH Local Network VoIP System

English | [简体中文](./README.md)

A Local Area Network (LAN) VoIP communication system based on FreeSWITCH, supporting peer-to-peer voice calls and call recording.

## Features

- :telephone: **Peer-to-Peer Voice Calls** - Make and receive voice calls between users within the local network
- :record: **Call Recording** - Automatic recording of all calls with playback capability
- :shield: **Secure Communication** - WSS (WebSocket Secure) encryption for SIP signaling
- :desktop_computer: **Modern Web Interface** - Responsive React-based UI with real-time call status
- :speech_balloon: **Call History** - Track and manage all incoming and outgoing calls
- :sound: **Audio Visualization** - Real-time audio waveform display during calls

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL + Prisma ORM |
| **Communication** | FreeSWITCH + ESL (Event Socket Library) |
| **Containerization** | Docker + Docker Compose |
| **SIP Client** | SIP.js (WebRTC) |

## Demo

<table>
  <tr>
    <th width="33%">Compressed</th>
    <th width="33%">1080p</th>
    <th width="33%">System Screenshot</th>
  </tr>
  <tr>
    <td>
      <video src="https://github.com/user-attachments/assets/d4c81d84-a13d-4d04-9514-69247da236bd" controls width="100%"></video>
    </td>
    <td>
      <video src="https://github.com/user-attachments/assets/b8c7b16f-5d40-42c2-befc-54bc973cef40" controls width="100%"></video>
    </td>
    <td>
      <img src="./demo/voip.png" alt="系统界面预览" width="100%">
    </td>
  </tr>
</table>

## Prerequisites

Before starting the project, ensure you have the following tools installed:

```bash
# Check installed versions
node --version      # >= 18.x
npm --version       # >= 9.x
docker --version    # >= 20.x
docker-compose --version
```

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/freeswitch-local-network.git
cd freeswitch-local-network
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Update Local Network IP Address

**Important**: You must update the IP address configuration when first starting or when changing network environments.

```bash
# Automatically detect and update local LAN IP (recommended)
npm run update-ip

# Or manually specify IP
node scripts/update-ip.js 192.168.1.100

# Preview mode (view changes without applying)
npm run update-ip:dry
```

This script automatically updates the IP addresses in the following configuration files:
- `freeswitch/conf/vars.xml` - FreeSWITCH global variables
- `freeswitch/conf/sip_profiles/internal.xml` - SIP configuration
- `freeswitch/conf/directory/default.xml` - User directory configuration
- `src/store/useCallStore.ts` - Frontend SIP domain configuration
- `nginx_proxy/nginx.conf` - Nginx proxy configuration

### 4. Start Docker Services

Start PostgreSQL, FreeSWITCH, and Nginx services:

```bash
docker-compose up -d
```

Verify service status:

```bash
docker-compose ps
```

### 5. Initialize Database

```bash
# Generate Prisma Client
npx prisma generate

# Push database schema
npx prisma db push
```

### 6. Start Development Server

```bash
# Start both frontend and backend
npm run dev
```

Or start separately:

```bash
# Frontend only (Vite dev server)
npm run client:dev

# Backend only (Express + Nodemon)
npm run server:dev
```

### 7. Access the Application

- **Frontend**: `https://<your-local-ip>:5173`
- **API Service**: `https://<your-local-ip>:3001`
- **FreeSWITCH ESL**: `https://<your-local-ip>:8021`
- **Nginx Proxy**: `https://<your-local-ip>:8443`

#### 7.1 SIP Registration

1. Open the application and enter your username
2. Click the **Login** button to register
3. After successful registration, the status bar will show online status (registered)

#### 7.2 Accept FreeSWITCH Certificate

**Required for first-time use**: In a LAN environment, you need to accept FreeSWITCH's self-signed certificate to establish an encrypted SIP connection (WSS).

1. Click the **"Cert"** button in the top navigation bar (yellow shield icon)
2. In the newly opened tab, the browser will warn that the certificate is untrusted
3. Click **"Advanced"** → **"Accept the Risk and Continue"**
4. After accepting the certificate, close the tab and return to the application

> **Why is this step necessary?**
>
> FreeSWITCH uses a self-signed certificate to provide WSS (WebSocket Secure) service. By default, browsers block such connections. Users need to manually trust the certificate before SIP.js can establish a secure connection via `wss://<IP>:8443`.

## Service Ports

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| Frontend Dev Server | 5173 | HTTP | Vite HMR |
| Backend API | 3001 | HTTP | Express REST API |
| PostgreSQL | 5432 | TCP | Database |
| FreeSWITCH SIP | 5060/5080 | UDP/TCP | SIP signaling |
| FreeSWITCH ESL | 8021 | TCP | Event Socket |
| FreeSWITCH WebSocket | 5066 | TCP | WS/WSS SIP |
| RTP Media Stream | 16384-16400 | UDP | Audio media |
| Nginx Proxy | 8443 | HTTPS | Reverse proxy |

## Available Commands

```bash
# Development
npm run client:dev      # Start frontend dev server
npm run server:dev      # Start backend dev server
npm run dev             # Start both frontend and backend

# Build
npm run build           # Build for production
npm run preview         # Preview production build

# Code Quality
npm run lint            # ESLint check
npm run check           # TypeScript type check

# Database
npm run prisma:studio   # Open Prisma Studio

# Utilities
npm run update-ip       # Update IP addresses in configuration
npm run update-ip:dry   # Preview IP updates (dry run)
```

## Project Structure

```
freeswitch-local-network/
├── api/                    # Backend code
│   ├── lib/               # ESL connection library
│   ├── routes/            # API routes
│   └── server.ts          # Backend entry point
├── src/                    # Frontend code
│   ├── components/        # React components
│   ├── pages/             # Page components
│   └── store/             # Zustand state management
├── freeswitch/            # FreeSWITCH configuration
│   └── conf/              # Configuration files
├── nginx_proxy/           # Nginx configuration
├── scripts/               # Utility scripts
├── demo/                  # Demo assets (screenshots, videos)
├── docker-compose.yml     # Docker service orchestration
└── package.json           # Project configuration
```

## Troubleshooting

### FreeSWITCH Connection Failed

Ensure Docker services are running properly:

```bash
docker-compose logs freeswitch
```

### Database Connection Error

Check PostgreSQL container status:

```bash
docker-compose ps postgres
```

### SIP Registration Failed

**Symptoms**: Unable to register to FreeSWITCH server after login, status bar shows offline

**Troubleshooting Steps**:

1. **Check Network Connectivity**
   ```bash
   # Test if FreeSWITCH service is accessible
   curl https://<your-lan-ip>:8443
   ```

2. **Update LAN IP Configuration**
   ```bash
   # Automatically detect and update local IP
   npm run update-ip

   # Or manually specify IP
   node scripts/update-ip.js 192.168.1.100

   # Preview changes without applying
   npm run update-ip:dry
   ```

3. **Verify FreeSWITCH Configuration**
   ```bash
   # View FreeSWITCH SIP configuration
   docker-compose exec freeswitch fs_cli -x "sofia status profile internal"

   # Check if Ext-RTP-IP and Ext-SIP-IP are correct
   ```

4. **Check if Extension Exists**
   ```bash
   # List all extensions
   docker-compose exec freeswitch fs_cli -x "user_list"
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [FreeSWITCH](https://freeswitch.org/) - The underlying telephony platform
- [SIP.js](https://sipjs.com/) - WebRTC SIP library for the browser
- [Prisma](https://www.prisma.io/) - Modern database toolkit
- [Vite](https://vitejs.dev/) - Next generation frontend tooling

## Contact

For questions, suggestions, or issues, please open an issue on GitHub.
