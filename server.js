const express = require("express");
const basicAuth = require("express-basic-auth");
const app = express();
const port = process.env.PORT || 3000;

const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;
const CLOUDFLARE_ZONE = process.env.CLOUDFLARE_ZONE;
const DDNS_USERNAME = process.env.DDNS_USERNAME || "your_username";
const DDNS_PASSWORD = process.env.DDNS_PASSWORD || "your_password";
const ALLOWED_HOSTNAMES = process.env.ALLOWED_HOSTNAMES?.split(",") || [];

app.use(
  basicAuth({
    users: { [DDNS_USERNAME]: DDNS_PASSWORD },
    unauthorizedResponse: "Unauthorized",
  })
);
app.get("/nic/update", async (req, res) => {
  const { hostname, myip } = req.query;
  console.log([
    "Received request:",
    JSON.stringify({ hostname, myip }),
    req.ip,
  ]);

  if (!hostname || !myip) {
    console.error("Missing hostname or IP address:", { hostname, myip });
    res.status(400).send("Missing hostname or IP address");
    return;
  }

  const myips = myip.split(",");
  console.log("IP addresses:", myips);
  const ipv4Regex = () =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = () =>
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/i;

  const firstipv4 = myips.find((ip) => ipv4Regex().test(ip));
  const firstipv6 = myips.find((ip) => ipv6Regex().test(ip));

  if (!firstipv4 && !firstipv6) {
    console.error("Invalid IPv4/6 address:", myip);
    res.status(400).send("Invalid IPv4/6 address");
    return;
  }

  if (ALLOWED_HOSTNAMES.length && !ALLOWED_HOSTNAMES.includes(hostname)) {
    res.status(403).send("Forbidden: This hostname is not allowed");
    return;
  }

  try {
    const zoneResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${CLOUDFLARE_ZONE}`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const zoneData = await zoneResponse.json();
    const zoneId = zoneData?.result?.[0]?.id;
    if (!zoneId) {
      console.error(zoneData);
      res.status(500).send("Error fetching zone ID");
      return;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${hostname}`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!data.result) {
      console.error(data);
      res.status(500).send("Error fetching DNS records");
      return;
    }

    const records = data.result;
    let ipv4RecordExists = false;
    let ipv6RecordExists = false;

    for (const record of records) {
      if (record.type === "A" && firstipv4) {
        ipv4RecordExists = true;
        await updateDnsRecord(zoneId, record.id, "A", hostname, firstipv4);
      } else if (record.type === "AAAA" && firstipv6) {
        ipv6RecordExists = true;
        await updateDnsRecord(zoneId, record.id, "AAAA", hostname, firstipv6);
      } else if (record.type === "A" && !firstipv4) {
        await deleteDnsRecord(zoneId, record.id);
      } else if (record.type === "AAAA" && !firstipv6) {
        await deleteDnsRecord(zoneId, record.id);
      }
    }

    // Create missing records if necessary
    if (firstipv4 && !ipv4RecordExists) {
      await createDnsRecord(zoneId, "A", hostname, firstipv4);
    }
    if (firstipv6 && !ipv6RecordExists) {
      await createDnsRecord(zoneId, "AAAA", hostname, firstipv6);
    }

    res.send("Record(s) updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating the record");
  }
});

// Helper function to create DNS record
async function createDnsRecord(zoneId, type, name, content) {
  console.log(`Creating record for ${name} with ${content}`);
  const result = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: type,
        name: name,
        content: content,
      }),
    }
  );

  const resultJson = await result.json();
  if (!resultJson.success) {
    console.error(`Failed to create ${type} record for ${name}:`, resultJson);
    throw new Error(`Error creating the ${type} record`);
  }
  console.log(`Created ${type} record for ${name} with ${content}`);
}

// Helper function to update DNS record
async function updateDnsRecord(zoneId, recordId, type, name, content) {
  console.log(`Updating record with ID ${recordId} to ${content}`);
  const result = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: type,
        name: name,
        content: content,
      }),
    }
  );

  const resultJson = await result.json();
  if (!resultJson.success) {
    console.error(`Failed to update ${type} record for ${name}:`, resultJson);
    throw new Error(`Error updating the ${type} record`);
  }
  console.log(`Updated ${type} record for ${name} to ${content}`);
}

// Helper function to delete DNS record
async function deleteDnsRecord(zoneId, recordId) {
  console.log(`Deleting record with ID ${recordId}`);
  const result = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const resultJson = await result.json();
  if (!resultJson.success) {
    console.error(`Failed to delete record with ID ${recordId}:`, resultJson);
    throw new Error("Error deleting the record");
  }
  console.log(`Deleted record with ID ${recordId}`);
}

app.listen(port, () => {
  console.log(`DDNS server listening at http://localhost:${port}`);
});
