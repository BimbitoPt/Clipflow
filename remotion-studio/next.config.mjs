/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["kokoro-js", "@huggingface/transformers", "onnxruntime-node"],
  },
};

export default nextConfig;
