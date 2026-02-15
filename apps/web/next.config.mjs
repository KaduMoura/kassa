/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: `${process.env.API_URL || 'http://api:4000'}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
