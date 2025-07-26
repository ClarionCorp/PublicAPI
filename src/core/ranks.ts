export type Rank = 
  | 'Rookie' 
  | 'Bronze' 
  | 'Mid Bronze' 
  | 'High Bronze' 
  | 'Silver' 
  | 'Mid Silver' 
  | 'High Silver' 
  | 'Gold' 
  | 'Mid Gold' 
  | 'High Gold' 
  | 'Platinum' 
  | 'Mid Platinum' 
  | 'High Platinum' 
  | 'Diamond' 
  | 'Mid Diamond' 
  | 'High Diamond' 
  | 'Challenger'
  | 'Mid Challenger'
  | 'High Challenger'
  | 'Omega'
  | 'Pro League'

  export type RankObject = { 
    name: Rank
    image: string
    color: string
    threshold: number
  }

export function getRankFromLP(lp: number) {
  let rankIndex = 0
  
  for (let i = 1; i < ranks.length; i++) {
    if (lp >= ranks[i].threshold) {
      rankIndex = i
    } else {
      break // break the loop when the threshold is higher than the input value
    }
  }

  const rankObject = ranks[rankIndex] as RankObject
  const prevRankObject = rankIndex > 0 ? ranks[rankIndex - 1] as RankObject : null
  const nextRankObject = rankIndex < ranks.length - 1 ? ranks[rankIndex + 1] as RankObject : null

  return { rankObject, prevRankObject, nextRankObject }
}

export function getRankGroup(input: number | string): string {
  let rankName: string;

  if (typeof input === 'number') {
    const { rankObject } = getRankFromLP(input);
    rankName = rankObject.name;
  } else {
    rankName = input;
  }

  // Collapse subranks into their base group
  const compressed = rankName
    .replace(/^Mid /, '')
    .replace(/^High /, '');

  return compressed;
}


const ranks = [
  {
    threshold: 0,
    name: 'Inactive/Unranked',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Rookie_Low.png',
    color: '#ECDCD0'
  },
  {
    threshold: 800,
    name: 'Rookie',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Rookie_Low.png',
    color: '#ECDCD0'
  },
  {
    threshold: 900,
    name: 'Mid Rookie',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Rookie_Mid.png',
    color: '#ECDCD0'
  },
  {
    threshold: 1000,
    name: 'High Rookie',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Rookie_High.png',
    color: '#ECDCD0'
  },
  {
    threshold: 1100,
    name: 'Bronze',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Bronze_Low.png',
    color: '#C88C59'
  },
  {
    threshold: 1200,
    name: 'Mid Bronze',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Bronze_Mid.png',
    color: '#C88C59'
  },
  {
    threshold: 1300,
    name: 'High Bronze',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Bronze_High.png',
    color: '#C88C59'
  },
  {
    threshold: 1400,
    name: 'Silver',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Silver_Low.png',
    color: '#9F9F9F'
  },
  {
    threshold: 1500,
    name: 'Mid Silver',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Silver_Mid.png',
    color: '#9F9F9F'
  },
  {
    threshold: 1600,
    name: 'High Silver',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Silver_High.png',
    color: '#9F9F9F'
  },
  {
    threshold: 1700,
    name: 'Gold',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Gold_Low.png',
    color: '#F1E385'
  },
  {
    threshold: 1800,
    name: 'Mid Gold',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Gold_Mid.png',
    color: '#F1E385'
  },
  {
    threshold: 1900,
    name: 'High Gold',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Gold_High.png',
    color: '#F1E385'
  },
  {
    threshold: 2000,
    name: 'Platinum',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Platinum_Low.png',
    color: '#2DE0A5'
  },
  {
    threshold: 2100,
    name: 'Mid Platinum',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Platinum_Mid.png',
    color: '#2DE0A5'
  },
  {
    threshold: 2200,
    name: 'High Platinum',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Platinum_High.png',
    color: '#2DE0A5'
  },
  {
    threshold: 2300,
    name: 'Diamond',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Diamond_Low.png',
    color: '#51B4FD'
  },
  {
    threshold: 2400,
    name: 'Mid Diamond',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Diamond_Mid.png',
    color: '#51B4FD'
  },
  {
    threshold: 2500,
    name: 'High Diamond',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Diamond_High.png',
    color: '#51B4FD'
  },
  {
    threshold: 2600,
    name: 'Challenger',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Master_Low.png',
    color: '#9952EE'
  },
  {
    threshold: 2700,
    name: 'Mid Challenger',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Master_Mid.png',
    color: '#9952EE'
  },
  {
    threshold: 2800,
    name: 'High Challenger',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Master_High.png',
    color: '#9952EE'
  },
  {
    threshold: 2900,
    name: 'Omega',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_Promethean.png',
    color: '#E1137A'
  },
  {
    threshold: 3000,
    name: 'Pro League',
    image: 'https://api.clarioncorp.net/static/rank/T_UI_RankedEmblem_ProLeague.png',
    color: '#ffd1fa'
  }
]