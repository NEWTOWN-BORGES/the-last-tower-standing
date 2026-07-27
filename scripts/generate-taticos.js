'use strict';
const fs = require('fs');

const factions = [
  { name: 'Reinos', slug: 'reinos', subfactions: ['Ordem', 'Engenharia', 'Forja', 'Milícia'] },
  { name: 'Coro', slug: 'coro', subfactions: ['Fé', 'Milagre', 'Purificação', 'Ascensão'] },
  { name: 'Verdemanto', slug: 'verdemanto', subfactions: ['Raízes', 'Veneno', 'Clima', 'Selvagem'] },
  { name: 'Sem-Céu', slug: 'semceu', subfactions: ['Corrupção', 'Pacto', 'Escuridão', 'Perdição'] },
  { name: 'Despertos', slug: 'despertos', subfactions: ['Tecnologia', 'Reparação', 'Sobrecarga', 'Evolução'] }
];

const tacticTypes = ['Equipamento', 'Magia', 'Consumível', 'Construção', 'Clima', 'Bênção'];
const distribution = [3, 3, 2, 2, 2, 3];

const tacticNames = {
  reinos: {
    'Equipamento': ['Espada Forjada', 'Armadura Pesada', 'Escudo Real', 'Lança Afiada', 'Capacete Nobre', 'Botas de Ferro', 'Cinturão de Couro', 'Arco Recurvo', 'Besta de Aço'],
    'Magia': ['Golpe Tátil', 'Proteção Real', 'Investida Furiosa', 'Refúgio da Fortaleza', 'Ordenança Suprema', 'Comando Marcial', 'Contramarca', 'Escudo Conjurado', 'Força Augmentada'],
    'Consumível': ['Elixir de Força', 'Pócima de Resistência', 'Bebida Energética', 'Antídoto Rápido', 'Bombim de Enxofre', 'Kit de Reparo Urgente'],
    'Construção': ['Barricada de Madeira', 'Balista de Campo', 'Catapulta Portátil', 'Armadilha de Lanças', 'Escudo de Campanha', 'Fornalha Móvel'],
    'Clima': ['Chuva Pesada', 'Lama Enlameada', 'Nevoeiro Cerrado', 'Tempestade de Areia'],
    'Bênção': ['Bênção Real', 'Marca do Campeão', 'Honra Restaurada', 'Maldição Covardia', 'Fraqueza Temporária', 'Desonra Pública']
  },
  coro: {
    'Equipamento': ['Cajado Sagrado', 'Vestes Abençoadas', 'Anel Divino', 'Toque Santificado', 'Livro Sagrado', 'Amuleto Protetor', 'Braçadeira Celestial', 'Manto Luminoso', 'Sandália Sagrada'],
    'Magia': ['Cura Divina', 'Bênção de Luz', 'Proteção Celestial', 'Purificação', 'Milagre Menor', 'Ressurreição Passageira', 'Escudo de Fé', 'Ascensão Espiritual', 'Iluminação'],
    'Consumível': ['Água Benta', 'Incenso Sagrado', 'Óleu Ungüento', 'Pergaminho Abençoado', 'Vinho Consagrado', 'Sal Santificado'],
    'Construção': ['Altar Portátil', 'Totem Sagrado', 'Portal Celeste', 'Cristal de Oração', 'Capelinha de Campanha', 'Fonte Purificadora'],
    'Clima': ['Eclipse Divino', 'Luz Lunar', 'Aurora Sagrada', 'Nevoeiro Cósmico'],
    'Bênção': ['Toque de Deus', 'Estigma Santo', 'Perdão Divino', 'Maldição de Sacrilégio', 'Desfavor Celestial', 'Excomunhão']
  },
  verdemanto: {
    'Equipamento': ['Lâmina de Raíz', 'Armadura Vegetal', 'Coroa de Flores', 'Lança Espinhosa', 'Luvas de Folha', 'Botas Radiculares', 'Cinturão de Cipó', 'Arco de Madeira Viva', 'Besta Orgânica'],
    'Magia': ['Raízes Prendentes', 'Veneno Letal', 'Espinhos Cortantes', 'Crescimento Acelerado', 'Liberação de Esporos', 'Tempestade de Sementes', 'Simbiose Vegetal', 'Transformação Fítoica', 'Apodrecimento Rápido'],
    'Consumível': ['Antídoto Herbal', 'Elixir de Seiva', 'Fruto Nutritivo', 'Musgo Curativo', 'Pó de Cura', 'Pasta Regenerativa'],
    'Construção': ['Cerca de Espinhos', 'Teia de Raízes', 'Fungos Defensivos', 'Árvore-Sentinela', 'Jardim Defensivo', 'Rede de Cipós'],
    'Clima': ['Chuva Ácida', 'Floresta Densa', 'Lama Tóxica', 'Bruma Venenosa'],
    'Bênção': ['Toque da Natureza', 'Marca da Selva', 'Simbiose Perfeita', 'Maldição Tóxica', 'Apodrecimento', 'Envenenamento Lento']
  },
  semceu: {
    'Equipamento': ['Lâmina Sombria', 'Armadura Negra', 'Coroa de Espinhos', 'Lança Amaldiçoada', 'Luvas do Abismo', 'Botas Espectrais', 'Corrente de Escuridão', 'Arco da Meia-Noite', 'Besta de Osso'],
    'Magia': ['Maldição Profunda', 'Escuridão Absoluta', 'Corrupção Progressiva', 'Pacto Sombrio', 'Invocação Demoníaca', 'Drenagem de Vida', 'Espelho Negativo', 'Sacrifício Ritual', 'Possessão'],
    'Consumível': ['Sangue Corrompido', 'Elixir Sombrio', 'Pócima Amaldiçoada', 'Antídoto Negro', 'Cristal de Escuridão', 'Pó Desperto'],
    'Construção': ['Altar Maldito', 'Totem Obscuro', 'Portal Infernal', 'Cristal Sombrio', 'Armadilha de Almas', 'Barreira de Trevas'],
    'Clima': ['Lua Vermelha', 'Ruínas Amaldiçoadas', 'Neblina Púrpura', 'Terreno Corrompido'],
    'Bênção': ['Marca Infernal', 'Pacto Demoníaco', 'Desejo Realizado', 'Maldição Mortal', 'Marca da Perdição', 'Condenação Eterna']
  },
  despertos: {
    'Equipamento': ['Lâmina Mecânica', 'Armadura de Placas', 'Óculos Aprimorados', 'Lança Energética', 'Luvas Motorizadas', 'Botas a Propulsão', 'Cinturão Pneumático', 'Arco Eletromágico', 'Besta Automatizada'],
    'Magia': ['Descarga Elétrica', 'Sobrecarga Energética', 'Reparação Rápida', 'Amplificação de Poder', 'Pulso Eletromagnético', 'Reconfiguração de Campo', 'Potência Máxima', 'Sincronização de Força', 'Explosão Controlada'],
    'Consumível': ['Célula Energética', 'Óleo Lubrificante', 'Combustível Elemental', 'Catalisador de Poder', 'Bateria de Reserva', 'Fluído de Reparação'],
    'Construção': ['Torrente Automática', 'Turela Defensiva', 'Rede Elétrica', 'Gerador Portátil', 'Escudo Energético', 'Amplificador de Campo'],
    'Clima': ['Tempestade Elétrica', 'Campo Magnético', 'Zona Radioativa', 'Poeira Condutora'],
    'Bênção': ['Sincronização Perfeita', 'Poder Amplificado', 'Evolução Acelerada', 'Maldição Mecânica', 'Sobrecarga Fatal', 'Falha Catastrófica']
  }
};

const cartasTaticas = [];
let id = 1;

for (const faction of factions) {
  for (let sf = 0; sf < faction.subfactions.length; sf++) {
    const subfaction = faction.subfactions[sf];

    for (let ti = 0; ti < tacticTypes.length; ti++) {
      const type = tacticTypes[ti];
      const count = distribution[ti];
      const names = tacticNames[faction.slug][type] || [];

      for (let ci = 0; ci < count; ci++) {
        const nameIdx = (sf * count + ci) % Math.max(1, names.length);
        cartasTaticas.push({
          id: `tatico-${String(id).padStart(3, '0')}`,
          nome: `${names[nameIdx] || type}`,
          faccao: faction.name,
          faccao_slug: faction.slug,
          subfaccao: subfaction,
          tipo_tatico: type,
          efeito_nome: `Efeito ${type}`,
          efeito_descricao: `Carta tática: ${type.toLowerCase()} da ${subfaction}`,
          custo: 0,
          imagem: `tatico-${String(id).padStart(3, '0')}.png`
        });
        id++;
      }
    }
  }
}

console.log(`Geradas ${cartasTaticas.length} cartas táticas`);
fs.writeFileSync('taticos_temp.json', JSON.stringify(cartasTaticas, null, 2));
console.log('Guardas em taticos_temp.json');
