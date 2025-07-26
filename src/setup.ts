// Self-Contained Script designed for setting up or updating tedious database entries.

import { Awakenings } from '../prisma/client';
import { prisma } from './plugins/prisma';
import chalk from "chalk";

async function main() {
  console.log(chalk.greenBright(`[>] Running setup script...`));

  await setupAwakenings();

  console.log(chalk.greenBright(`[>] Setup Complete.`));
  return 0;
}


async function setupAwakenings() {
  const awakenings = [
    { id: 'T_Aerials', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Aerials.webp`, name: `Aerials`, description: `DASH range, BLINK range, and HASTE effects increased +75%. PROJECTILES gain +42.5% travel or cast range.` },
    { id: 'T_AmongTitans', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_AmongTitans.webp`, name: `Among Titans`, description: `Lose 30% Size and gain +12% Speed. Additionally, your teammates gain +15% Size.` },
    { id: 'T_BigFish', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_BigFish.webp`, name: `Big Fish`, description: `Gain +22.5% Size and +175 max stagger.` },
    { id: 'T_BuiltDifferent', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_BuiltDifferent.webp`, name: `Built Different`, description: `Gain +22.5% Size. Your IMPACT abilities hit +5% harder. (+1% on Core).` },
    { id: 'T_BulkUp', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_BulkUp.webp`, name: `Bulk Up`, description: `Gain +300 max stagger. Gain an additional +1.5 Power for every 100 max stagger you have.` },
    { id: 'T_CastToLast', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_CastToLast.webp`, name: `Cast To Last`, description: `Ability BUFFS and DEBUFFS you cast last +55% longer. CREATIONS last +40% longer.` },
    { id: 'T_Catalyst', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Catalyst.webp`, name: `Catalyst`, description: `Gain +15% more Energy from dealing damage. Taking damage generates +3.6 Energy. (+1.2 for LIGHT hits).` },
    { id: 'T_Chronoboost', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Chronoboost.webp`, name: `Chronoboost`, description: `DASH range, BLINK range, and HASTE effects increased +75%. Ability BUFFS and DEBUFFS last +22.5% longer.` },
    { id: 'T_DeadEye', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_DeadEye.webp`, name: `Deadeye`, description: `Attack +25% harder (+6.5% to Core) against targets at 525+ range.` },
    { id: 'T_Demolitionist', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Demolitionist.webp`, name: `Demolitionist`, description: `Gain +20% Size. Whenever you destroy or assist in destroying an enemy barrier, all your cooldowns are reduced by 3s.` },
    { id: 'T_Egoist', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Egoist.webp`, name: `Egoist`, description: `Evades refund 8 Energy (16 from Energy Bursts). Reaching max Energy grants +60% Speed for 6s, reducing to +8% speed when you remain at max Energy.` },
    { id: 'T_ExplosiveEntrance', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_ExplosiveEntrance.webp`, name: `Explosive Entrance`, description: `DASH range, BLINK range, and HASTE effects/range increased +70%. Your IMPACT abilities hit +15% harder. (+3.25% on Core)` },
    { id: 'T_ExtraSpecial', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_ExtraSpecial.webp`, name: `Extra Special`, description: `SPECIAL cooldown reduced by -25%. Each round, its cooldown is reset.` },
    { id: 'T_FightOrFlight', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_FightOrFlight.webp`, name: `Fight Or Flight`, description: `Gain +12.5% Speed for 1.25s whenever you hit something or get hit. Refresh your SECONDARY whenever you stagger an enemy or become staggered.` },
    { id: 'T_FireUp', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_FireUp.webp`, name: `Fire Up`, description: `Gain 10 Energy on round start. Casting Energy Burst restores 25% of max Energy to other allies and Speeds up your whole team by 40% for 5s.` },
    { id: 'T_GlassCannon', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_GlassCannon.webp`, name: `Glass Cannon`, description: `Gain +4 Power and +2% Speed every 2s. (up to +28 Power and +14% Speed). Getting hit resets the timer.` },
    { id: 'T_HotShot', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_HotShot.webp`, name: `Hotshot`, description: `Abilities hit the Core +13% harder and refund 32.5% of the ability's cooldown on hit. Applies once per cast, refunding a max of 3s.` },
    { id: 'T_ImpactSpecialist', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_ImpactSpecialist.webp`, name: `Specialized Training`, description: `SPECIAL hits +35% harder (+8% to Core) and healing is +40% more effective.` },
    { id: 'T_MissilePropulsion', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_MissilePropulsion.webp`, name: `Missile Propulsion`, description: `PROJECTILES gain +70% travel or cast range and hit +22.5% harder (+4.5% to Core).` },
    { id: 'T_MomentumBoots', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_MomentumBoots.webp`, name: `Momentum Boots`, description: `` },
    { id: 'T_Monumentalist', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Monumentalist.webp`, name: `Monumentalist`, description: `CREATIONS gain +85% size and hit +20% harder. (+4% to Core)` },
    { id: 'T_OneTwoPunch', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_OneTwoPunch.webp`, name: `One-Two Punch`, description: `Attack +20% harder (+12% to CORE) against targets you've hit within 1.5s.` },
    { id: 'T_OrbSharer', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_OrbSharer.webp`, name: `Orb Replicator`, description: `110% of benefits from Power Orbs you collect is also granted to allies. (..Yes, your allies get more than you do...)` },
    { id: 'T_PeakPerformance', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_PeakPerformance.webp`, name: `Peak Performance`, description: `Gain +300 max stagger. Gain an additional +0.50% Speed for every 100 max stagger you have.` },
    { id: 'T_PerfectForm', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_PerfectForm.webp`, name: `Perfect Form`, description: `Hits reduce other ability cooldowns by -12%, up to 1.5s per hit (-4%/0.5s for LIGHT hits).` },
    { id: 'T_PrimeTime', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_PrimeTime.webp`, name: `Primetime`, description: `PRIMARY gains +1 charge and hits 4.5% weaker. (-1% to the Core)` },
    { id: 'T_PrizeFighter', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_PrizeFighter.webp`, name: `Prize Fighter`, description: `Begin each set with 1 Prize Fighter stack, granting +18 Power. Takedowns grant +1 Prize Fighter stack (max 4 stacks). Getting K.O.'d removes a stack. Stacks reset between sets.` },
    { id: 'T_QuickStrike', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_QuickStrike.webp`, name: `Quick Strike`, description: `STRIKE cooldown reduced by -15%. STRIKE hits grant +2 additional energy.` },
    { id: 'T_RapidFire', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_RapidFire.webp`, name: `Rapid Fire`, description: `PRIMARY cooldown reduced by -33%.` },
    { id: 'T_Reverberation', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Reverberation.webp`, name: `Reverberation`, description: `Gain +360 max stagger. Gain an additional +1.20 Cooldown Rate for every 100 max stagger you have.` },
    { id: 'T_ShockAndAwe', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_ShockAndAwe.webp`, name: `Heavy Impact`, description: `IMPACTS hit +15% harder (+4% on Core). Whenever you attack 2 or more targets with a single ability, its cooldown is reduced by -22.5% (up to 3s).` },
    { id: 'T_SiegeMachine', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SiegeMachine.webp`, name: `Siege Machine`, description: `PROJECTILES gain +30% travel or cast range. CREATIONS gain +30% duration and hit +20% harder. (+4% to Core)` },
    { id: 'T_SparkofAgility', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SparkofAgility.webp`, name: `Spark of Agility`, description: `Grants +1 SPARK. Gain +2% Speed, plus +5% per SPARK you have.` },
    { id: 'T_SparkofFocus', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SparkofFocus.webp`, name: `Spark of Focus`, description: `Grants +1 SPARK. Gain +5 Cooldown Rate, additionally +9 per SPARK you have.` },
    { id: 'T_SparkofLeadership', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SparkofLeadership.webp`, name: `Spark of Leadership`, description: `Grants +1 SPARK. Your teammates gain 25% of your SPARK effects. Additionally, you gain +6 Cooldown Rate, +130 stagger, +8 Power, and +2% speed.` },
    { id: 'T_SparkofResilience', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SparkofResilience.webp`, name: `Spark of Resilience`, description: `Grants +1 SPARK. Gain +105 max stagger, additionally +350 per SPARK you have.` },
    { id: 'T_SparkofStrength', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SparkofStrength.webp`, name: `Spark of Strength`, description: `Grants +1 SPARK. Gain +4 Power, additionally +18 per SPARK you have.` },
    { id: 'T_StaggerSwagger', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_StaggerSwagger.webp`, name: `Stagger Swagger`, description: `Gain +7% Speed. While below 50% stagger, this effect increases to +15% and you heal +150 HP/s, including while in the Staggered state.` },
    { id: 'T_SuperSurge', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_SuperSurge.webp`, name: `Super Surge`, description: `DASH range, BLINK range, and HASTE effects increased 75%. These abilities hit 25% harder (8% to Core).` },
    { id: 'T_TeamPlayer', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_TeamPlayer.webp`, name: `Team Player`, description: `STRIKE hits the core +15% harder when aiming towards a teammate. If that teammate STRIKES the core within 1.5s, they will hit the core +12.5% harder. If they too STRIKE towards another teammate, they can transfer this buff.` },
    { id: 'T_TempoSwings', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_TempoSwings.webp`, name: `Tempo Swing`, description: `Hitting anything heals you for 6% of your max Stagger (2% for LIGHT hits) and deals that amount as damage to the target hit.` },
    { id: 'T_TimelessCreator', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_TimelessCreator.webp`, name: `Timeless Creator`, description: `CREATIONS gain +60% duration and +35% size.` },
    { id: 'T_TwinDrive', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_TwinDrive.webp`, name: `Twin Drive`, description: `SECONDARY gains +1 charge and has a -2.5% decreased cooldown.` },
    { id: 'T_Unstoppable', image: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/awakening/T_Unstoppable.webp`, name: `Unstoppable`, description: `Gain a shield that protects you from 100% of the damage and 100% knockback from the first hit you take. The shield recharges at the start of each round and after 6.5s of not getting hit.` },
  ];

  for (const awakening of awakenings) {
    await prisma.awakenings.upsert({
      where: { id: awakening.id },
      update: {
        name: awakening.name,
        description: awakening.description,
        image: awakening.image,
      },
      create: {
        id: awakening.id,
        name: awakening.name,
        description: awakening.description,
        image: awakening.image,
        active: true, // Just make them all true by default and change later
      },
    });
    console.log(chalk.gray(`[DEBUG] Upserted ${awakening.id} to Awakenings Table!`));
  }

  console.log(chalk.greenBright(`[>] Successfully added all awakenings.`));
}


main().catch(console.error);