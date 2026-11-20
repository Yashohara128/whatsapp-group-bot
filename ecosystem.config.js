rm -f ecosystem.config.js
cat << 'EOF' > ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "whatsapp-bot",
      script: "index.js",
      env: {
        NODE_ENV: "production",
        GROQ_API_KEY: "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"
      }
    }
  ]
};
EOF
node -c ecosystem.config.js
