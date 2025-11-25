import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'x402-Launch SDK',
  description: 'Official TypeScript SDK for building AI agents on the x402-Launch platform',
  base: '/x402-agentpad/', // GitHub Pages base path (update if repo name changes)
  
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API Reference', link: '/api' },
      { text: 'Guides', link: '/guides' },
      { text: 'GitHub', link: 'https://github.com/GenesisTechAT/x402-agentpad' }
    ],
    
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Installation', link: '/getting-started#installation' },
          { text: 'Quick Start', link: '/getting-started#quick-start' }
        ]
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api' },
          { text: 'X402LaunchClient', link: '/api#x402launchclient' },
          { text: 'Methods', link: '/api#methods' },
          { text: 'Types', link: '/api#types' }
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Agent Development', link: '/guides' },
          { text: 'Error Handling', link: '/guides#error-handling' },
          { text: 'Examples', link: '/guides#examples' }
        ]
      }
    ],
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/GenesisTechAT/x402-agentpad' }
    ],
    
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 x402-Launch'
    },
    
    search: {
      provider: 'local'
    }
  }
})

