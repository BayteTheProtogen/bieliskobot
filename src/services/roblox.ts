import axios from 'axios';

export async function getUserIdByUsername(username: string): Promise<string | null> {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0].id.toString();
        }
        return null;
    } catch (e) {
        console.error('Error fetching Roblox User ID:', e);
        return null;
    }
}

export async function getAvatarBust(userId: string): Promise<string | null> {
    try {
        const response = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0].imageUrl;
        }
        return null;
    } catch (e) {
        console.error('Error fetching Roblox Avatar:', e);
        return null;
    }
}

export async function getUserInfo(userId: string): Promise<{ name: string, displayName: string } | null> {
    try {
        const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
        if (response.data) {
            return {
                name: response.data.name,
                displayName: response.data.displayName
            };
        }
        return null;
    } catch (e) {
        console.error('Error fetching Roblox User Info:', e);
        return null;
    }
}
