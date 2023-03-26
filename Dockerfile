FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the server code to the container
COPY . .

# Expose the port the server will run on
EXPOSE 3000

# Set the environment variables
ENV CLOUDFLARE_API_KEY=your_api_key
ENV CLOUDFLARE_ZONE=your_zone

# Start the server
CMD ["node", "server.js"]