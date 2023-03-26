const express = require('express');
const basicAuth = require('express-basic-auth');
const app = express();
const port = process.env.PORT || 3000;

const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;
const CLOUDFLARE_ZONE = process.env.CLOUDFLARE_ZONE;
const DDNS_USERNAME = process.env.DDNS_USERNAME || 'your_username';
const DDNS_PASSWORD = process.env.DDNS_PASSWORD || 'your_password';
const ALLOWED_HOSTNAMES = process.env.ALLOWED_HOSTNAMES?.split(',') || [];

app.use(basicAuth({
    users: { [DDNS_USERNAME]: DDNS_PASSWORD },
    unauthorizedResponse: 'Unauthorized',
}));

app.get('/nic/update', async (req, res) => {
    const { hostname, myip } = req.query;

    if (!hostname || !myip) {
        res.status(400).send('Missing hostname or IP address');
        return;
    }

    if (ALLOWED_HOSTNAMES.length && !ALLOWED_HOSTNAMES.includes(hostname)) {
        res.status(403).send('Forbidden: This hostname is not allowed');
        return;
    }

    try {
        const zoneResponse = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${CLOUDFLARE_ZONE}`, {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const zoneData = await zoneResponse.json();
        const zoneId = zoneData?.result?.[0]?.id;
        if (!zoneId) {
            console.error(zoneData);
            res.status(500).send('Error fetching zone ID');
            return;
        }

        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!data.result) {
            console.error(data);
            res.status(500).send('Error fetching DNS records');
            return;
        }
        const record = data.result.find(record => record.name === hostname);

        if (!record) {
            res.status(404).send('Hostname not found');
            return;
        }

        const result = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: record.type,
                name: hostname,
                content: myip,
            }),
        });
        console.log(`Updated ${hostname} to ${myip}`);
        const resultJson = await result.json();

        if (!resultJson.success) {
            console.error(resultJson);
            res.status(500).send('Error updating the record');
            return;
        }


        res.send('Record updated');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error updating the record');
    }
});

app.listen(port, () => {
    console.log(`DDNS server listening at http://localhost:${port}`);
});
