const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'TubeFetch',
    executableName: 'tube-fetch',
    extraResource: [
      './bin'
    ],
    // icon: './icon'
  },
  rebuildConfig: {},
  makers: [
    // --- CONFIGURAÇÃO DO MSI (WIX) ---
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: "TubeFetch",
        exe: "tube-fetch.exe",
        
        language: 1046, // 1046 = Português do Brasil
        manufacturer: "Jean Carlos",
        description: "Baixador de Músicas do YouTube",
        version: "1.0.0",
        
        // Interface do Usuário (UI)
        ui: {
          chooseDirectory: true,
          // images: {
             // background: 'caminho/para/imagem-fundo.bmp', // Opcional: Imagem lateral do instalador
             // banner: 'caminho/para/imagem-topo.bmp'      // Opcional: Imagem do topo
          // }
        },

        // Atalhos
        shortcutFolderName: "TubeFetch",
        programFilesFolderName: "TubeFetch",
        
        // Opções de Upgrade (Gera UUIDs consistentes para permitir atualização por cima)
        upgradeCode: '58a1539d-6044-4438-8b2e-1234567890ab' // UUID aleatório fixo para este projeto
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        devServer: { 
          headers: { 'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';" }
        },
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/index.html',
              js: './src/renderer.jsx',
              name: 'main_window',
              preload: { js: './src/preload.js' },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'JeanCarlos0112',
          name: 'tubefetch'
        },
        prerelease: false
      }
    }
  ],
};
