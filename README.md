# Cloudflare DDNS Server

A simple Node.js server that accepts DDNS update requests and updates Cloudflare DNS records.

## Requirements

- Node.js
- Docker and Docker Compose (optional)

## Environment Variables

- `CLOUDFLARE_API_KEY`: Your Cloudflare API key.
- `CLOUDFLARE_ZONE`: Your Cloudflare zone (domain).
- `DDNS_USERNAME`: The username for authenticating DDNS update requests.
- `DDNS_PASSWORD`: The password for authenticating DDNS update requests.
- `ALLOWED_HOSTNAMES`: A comma-separated list of allowed hostnames to update. Only hostnames in this list can be updated using the DDNS server.

## Setup

### With Docker Compose

1. Clone the repository and navigate to the project directory.
2. Create a `docker-compose.yml` file with the following content:

```yaml
version: '3.9'

services:
  ddns-server:
    image: daniel100097/ddns-server-cloudflare:latest
    environment:
      CLOUDFLARE_API_KEY: <your_cloudflare_api_key>
      CLOUDFLARE_ZONE: <your_cloudflare_zone>
      DDNS_USERNAME: <your_ddns_username>
      DDNS_PASSWORD: <your_ddns_password>
      ALLOWED_HOSTNAMES: <comma_separated_list_of_allowed_hostnames>
    ports:
      - "3000:3000"
```

Replace the placeholder values with your actual environment variables.

Run docker-compose up to start the server.


### Usage
Send an HTTP GET request to the following URL to update the DNS record:

```
https://<your-server-address>/nic/update?hostname=<hostname>&myip=<ipaddr>
Replace <your-server-address> with your server's address, <hostname> with the hostname you want to update, and <ipaddr> with the new IP address.
```

The server will authenticate the request using the Authorization header with the Basic scheme. Include the DDNS_USERNAME and DDNS_PASSWORD as the username and password for the basic authentication.

### Example with curl:

```sh
curl -X GET -u "<DDNS_USERNAME>:<DDNS_PASSWORD>" "https://<your-server-address>/nic/update?hostname=<hostname>&myip=<ipaddr>"
Replace <DDNS_USERNAME> and <DDNS_PASSWORD> with the actual values you set for those environment variables.
```


### Docker Hub
The Docker image for this project is available on Docker Hub: daniel100097/ddns-server-cloudflare:latest

License
MIT