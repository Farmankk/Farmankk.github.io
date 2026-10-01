# Car 4 Rent Web - Fast Execution Guidelines

- **Strict Tool Call Limit:** Maximum 1 to 2 tool calls per user turn. No loops, no wide scans.
- **Pre-Mapped Architecture:** All files, endpoints, line areas, and functions are documented in `PROJECT_ARCHITECTURE.md`.
- **Zero Discovery Overhead:** Jump directly to target lines using `replace_file_content`.
- **Never Run `build_release.js` Automatically:** Only run build when user explicitly commands it.
- **Strict Server Firewall & IP Ban Protection:** Never execute rapid/looping FTP connection attempts. If an FTP connection fails or times out once, STOP immediately and warn the user. Rapid retries trigger hosting CSF/LFD firewall bans on the user's home/office IP.
- **Language:** Roman Urdu only. Instant 2-line response.
