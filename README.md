# Colônia Aurora

Um jogo 2D top-down de fazenda espacial e construção de colônia, jogável direto no navegador. Cultive o impossível, monte uma base autossuficiente e expanda a humanidade por cinco mundos do sistema Aurora.

![Colônia Aurora](https://img.shields.io/badge/status-jogável-6ee7ff?style=for-the-badge)

## O que tem no jogo

- **Fazenda no espaço:** prepare canteiros, regue, plante e colha lumifrutas, trigo estelar e criobagas.
- **Construção de colônia:** habitats, painéis solares, extratores de água, estufas, oficinas, laboratórios, plataformas de pouso e faróis de colonização.
- **Economia viva:** colonos consomem água e alimento, geram créditos e aumentam a produção. A felicidade afeta o rendimento de cada ciclo.
- **Cinco planetas:** Nix (início), Cinder, Verdant, Frost e Aether, cada um com bioma, modificadores, recursos e arte procedural próprios.
- **Pesquisa e rotas:** laboratórios geram pesquisa; pesquisa e colônias desbloqueiam viagens interestelares.
- **Reivindicação de mundos:** em planetas virgens, construa um Farol de Colonização para fundar uma nova colônia.
- **Ciclo dia/noite, clima, partículas e áudio sintetizado:** tudo gerado no navegador, sem assets externos.
- **Progressão guiada:** 11 diretrizes, recompensas, notificações e salvamento automático local.

## Como jogar

| Ação | Teclado | Toque |
| --- | --- | --- |
| Mover | WASD / setas | Joystick virtual |
| Usar ferramenta | E / Espaço | Botão **E** |
| Trocar semente | Q | Seletor de sementes |
| Selecionar ferramenta | 1–6 | Barra de equipamento |
| Construir | B | Botão **CONSTRUIR** |
| Mapa estelar | M | Botão **MAPA** |
| Ajuda | H | Botão de ajuda |
| Pausa / fechar menu | Esc | Botão de menu |
| Som | F | Botão de som |

### Primeiros passos

1. Use a **enxada** em solo livre para preparar canteiros.
2. Regue e plante sementes. Plantas maduras brilham em dourado.
3. Colha para obter alimento, créditos e novas sementes.
4. Abra **CONSTRUIR** e erga um Habitat e um Painel Solar.
5. Colete cristais, sucata, gelo e flora pelo terreno.
6. Pesquise no Laboratório, abra o **MAPA** e viaje para Cinder.
7. Em um mundo novo, construa o **Farol de Colonização**.

## Executar localmente

O projeto é estático, sem etapa de build e sem dependências de runtime.

```bash
./start.sh
# abre em http://localhost:3000
```

Se preferir qualquer servidor estático:

```bash
python3 -m http.server 3000
```

## Testes

Os testes de simulação usam o runner nativo do Node:

```bash
node --experimental-default-type=module --test tests/core.test.mjs
```

## Estrutura

```text
index.html          telas, HUD e overlines
styles.css          sistema visual e responsividade
src/config.js       planetas, culturas, estruturas, missões e balanceamento
src/world.js        terreno procedural, colisão e posicionamento
src/sim.js          estado, economia, ações, missões, viagem e save
src/render.js       renderização do mundo e da tela-título
src/map.js          mapa estelar animado
src/ui.js           HUD, menus, toasts e controles de toque
src/audio.js        música e efeitos sintetizados via WebAudio
src/save.js         persistência em localStorage
src/main.js         loop principal, câmera e integração
tests/core.test.mjs testes da simulação
```

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Remixed using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/renanmadono-source/Colonia2D)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/renanmadono-source/Colonia2D)

- 🎮 [Open the project](https://omgithub.com/renanmadono-source/Colonia2D).
- ✨ [Remix this project](https://omgithub.com/?remix=renanmadono-source%2FColonia2D).
- 💻 [Explore the source](https://github.com/renanmadono-source/Colonia2D).
- 🛠️ [Check build runs](https://github.com/renanmadono-source/Colonia2D/actions).
- 🐛 [Report an issue](https://github.com/renanmadono-source/Colonia2D/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/renanmadono-source).
- 🌍 [Create with OMGithub](https://omgithub.com).
- 🧬 [Explore the remix source](https://github.com/renanmadono-source/Colonia2D).
<!-- omgithub:readme:end -->
