import { ApiProperty } from '@nestjs/swagger';

export class MeasuredGamesResponseDto {
  @ApiProperty({ example: 6 }) minutesSeconds!: number;
  @ApiProperty({ example: 6 }) pts!: number;
  @ApiProperty({ example: 6 }) reb!: number;
  @ApiProperty({ example: 6 }) ast!: number;
  @ApiProperty({ example: 6 }) stl!: number;
  @ApiProperty({ example: 6 }) blk!: number;
  @ApiProperty({ example: 6 }) tov!: number;
  @ApiProperty({ example: 6 }) pf!: number;
  @ApiProperty({ example: 6 }) fgm!: number;
  @ApiProperty({ example: 6 }) fga!: number;
  @ApiProperty({ example: 6 }) threeFgm!: number;
  @ApiProperty({ example: 6 }) threeFga!: number;
  @ApiProperty({ example: 6 }) ftm!: number;
  @ApiProperty({ example: 6 }) fta!: number;
}

export class StatisticValuesResponseDto {
  @ApiProperty({ example: 11880, nullable: true })
  minutesSeconds!: number | null;
  @ApiProperty({ example: 120, nullable: true }) pts!: number | null;
  @ApiProperty({ example: 48, nullable: true }) reb!: number | null;
  @ApiProperty({ example: 30, nullable: true }) ast!: number | null;
  @ApiProperty({ example: 12, nullable: true }) stl!: number | null;
  @ApiProperty({ example: 6, nullable: true }) blk!: number | null;
  @ApiProperty({ example: 18, nullable: true }) tov!: number | null;
  @ApiProperty({ example: 12, nullable: true }) pf!: number | null;
  @ApiProperty({ example: 45, nullable: true }) fgm!: number | null;
  @ApiProperty({ example: 90, nullable: true }) fga!: number | null;
  @ApiProperty({ example: 18, nullable: true }) threeFgm!: number | null;
  @ApiProperty({ example: 42, nullable: true }) threeFga!: number | null;
  @ApiProperty({ example: 12, nullable: true }) ftm!: number | null;
  @ApiProperty({ example: 18, nullable: true }) fta!: number | null;
}

export class ShootingStatisticsResponseDto {
  @ApiProperty({ example: 0.5, nullable: true }) fgPct!: number | null;
  @ApiProperty({ example: 0.429, nullable: true })
  threeFgPct!: number | null;
  @ApiProperty({ example: 0.667, nullable: true }) ftPct!: number | null;
  @ApiProperty({ example: 0.613, nullable: true })
  trueShootingPct!: number | null;
}

export class EfficiencyStatisticsResponseDto {
  @ApiProperty({ example: 6 }) measuredGames!: number;
  @ApiProperty({ example: 147, nullable: true }) total!: number | null;
  @ApiProperty({ example: 24.5, nullable: true }) perGame!: number | null;
}

export class StatisticsResponseDto {
  @ApiProperty({ example: 6 }) gamesPlayed!: number;
  @ApiProperty({ type: MeasuredGamesResponseDto })
  measuredGames!: MeasuredGamesResponseDto;
  @ApiProperty({ type: StatisticValuesResponseDto })
  totals!: StatisticValuesResponseDto;
  @ApiProperty({ type: StatisticValuesResponseDto })
  perGame!: StatisticValuesResponseDto;
  @ApiProperty({ type: ShootingStatisticsResponseDto })
  shooting!: ShootingStatisticsResponseDto;
  @ApiProperty({ type: EfficiencyStatisticsResponseDto })
  efficiency!: EfficiencyStatisticsResponseDto;
}
