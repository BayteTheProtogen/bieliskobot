require('dotenv').config();
const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('https://api.policeroleplay.community/v1/server/players', {
            headers: { 'Server-Key': process.env.ERLC_SERVER_KEY || '' }
        });
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
