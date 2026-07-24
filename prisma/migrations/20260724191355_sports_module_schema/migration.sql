-- CreateEnum
CREATE TYPE "basketball_position" AS ENUM ('PG', 'SG', 'SF', 'PF', 'C');

-- CreateEnum
CREATE TYPE "brazilian_state" AS ENUM ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO');

-- CreateEnum
CREATE TYPE "season_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "tournament_status" AS ENUM ('DRAFT', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "tournament_format" AS ENUM ('LEAGUE', 'GROUP_STAGE', 'KNOCKOUT', 'GROUP_STAGE_KNOCKOUT');

-- CreateEnum
CREATE TYPE "tournament_team_status" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "roster_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "roster_role" AS ENUM ('ATHLETE', 'COACHING_STAFF');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "match_side" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "match_result" AS ENUM ('WIN', 'LOSS');

-- CreateEnum
CREATE TYPE "loss_type" AS ENUM ('NORMAL', 'DEFAULT', 'FORFEIT');

-- CreateEnum
CREATE TYPE "match_roster_status" AS ENUM ('AVAILABLE', 'DNP');

-- CreateEnum
CREATE TYPE "period_type" AS ENUM ('REGULAR', 'OVERTIME');

-- AlterTable
ALTER TABLE "organization_user_affiliations" ADD COLUMN     "position" "basketball_position";

-- AlterTable
-- short_name is NOT NULL with no default, on a populated table. Add it nullable,
-- backfill a 3-char sigla from name (a one-time initial value the org edits later,
-- never recalculated — see sports DB design 5.0b), then enforce NOT NULL.
-- city and state stay nullable and need no backfill.
ALTER TABLE "teams" ADD COLUMN     "city" TEXT,
ADD COLUMN     "short_name" TEXT,
ADD COLUMN     "state" "brazilian_state";

UPDATE "teams"
SET "short_name" = upper(substring(regexp_replace("name", '[^[:alnum:] ]', '', 'g') FROM 1 FOR 3))
WHERE "short_name" IS NULL;

ALTER TABLE "teams" ALTER COLUMN "short_name" SET NOT NULL;

-- CreateTable
CREATE TABLE "match_periods" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "match_id" INTEGER NOT NULL,
    "period_number" INTEGER NOT NULL,
    "period_type" "period_type" NOT NULL,
    "home_points" INTEGER NOT NULL,
    "away_points" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_rosters" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "match_id" INTEGER NOT NULL,
    "match_team_id" INTEGER NOT NULL,
    "tournament_roster_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "roster_role" NOT NULL,
    "jersey_number_snapshot" INTEGER,
    "display_name_snapshot" TEXT NOT NULL,
    "status" "match_roster_status" NOT NULL DEFAULT 'AVAILABLE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_teams" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "match_id" INTEGER NOT NULL,
    "tournament_team_id" INTEGER NOT NULL,
    "side" "match_side" NOT NULL,
    "final_score" INTEGER,
    "result" "match_result",
    "loss_type" "loss_type",
    "is_winner" BOOLEAN,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "tournament_group_id" INTEGER,
    "match_number" INTEGER,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "status" "match_status" NOT NULL DEFAULT 'SCHEDULED',
    "venue_name" TEXT,
    "created_by_user_id" INTEGER,
    "mvp_match_roster_id" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_match_statistics" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "match_id" INTEGER NOT NULL,
    "match_team_id" INTEGER NOT NULL,
    "match_roster_id" INTEGER,
    "tournament_roster_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pts" INTEGER,
    "fgm" INTEGER,
    "fga" INTEGER,
    "three_fgm" INTEGER,
    "three_fga" INTEGER,
    "ftm" INTEGER,
    "fta" INTEGER,
    "reb" INTEGER,
    "ast" INTEGER,
    "stl" INTEGER,
    "blk" INTEGER,
    "tov" INTEGER,
    "pf" INTEGER,
    "minutes_seconds" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_match_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "season_status" NOT NULL DEFAULT 'ACTIVE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_bracket_rounds" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_bracket_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_bracket_slots" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "round_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "home_tournament_team_id" INTEGER,
    "away_tournament_team_id" INTEGER,
    "match_id" INTEGER,
    "winner_tournament_team_id" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_bracket_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_categories" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "sort_order" INTEGER,
    "status" "entity_status" NOT NULL DEFAULT 'ACTIVE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_group_teams" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "tournament_group_id" INTEGER NOT NULL,
    "tournament_team_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_group_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_groups" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_rosters" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "tournament_team_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "organization_user_affiliation_id" INTEGER,
    "role" "roster_role" NOT NULL,
    "jersey_number_snapshot" INTEGER,
    "display_name_snapshot" TEXT NOT NULL,
    "status" "roster_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3),
    "left_at" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_teams" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "organization_team_affiliation_id" INTEGER,
    "status" "tournament_team_status" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER,
    "tiebreak_order" INTEGER,
    "tiebreak_block_key" TEXT,
    "display_name_snapshot" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "category_id" INTEGER,
    "regulation" TEXT,
    "format" "tournament_format" NOT NULL,
    "status" "tournament_status" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "registration_starts_at" TIMESTAMPTZ(3),
    "registration_ends_at" TIMESTAMPTZ(3),
    "created_by_user_id" INTEGER,
    "mvp_tournament_roster_id" INTEGER,
    "champion_tournament_team_id" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "match_periods" ADD CONSTRAINT "match_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_periods" ADD CONSTRAINT "match_periods_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rosters" ADD CONSTRAINT "match_rosters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rosters" ADD CONSTRAINT "match_rosters_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rosters" ADD CONSTRAINT "match_rosters_match_team_id_fkey" FOREIGN KEY ("match_team_id") REFERENCES "match_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rosters" ADD CONSTRAINT "match_rosters_tournament_roster_id_fkey" FOREIGN KEY ("tournament_roster_id") REFERENCES "tournament_rosters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rosters" ADD CONSTRAINT "match_rosters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_group_id_fkey" FOREIGN KEY ("tournament_group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_mvp_match_roster_id_fkey" FOREIGN KEY ("mvp_match_roster_id") REFERENCES "match_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_match_team_id_fkey" FOREIGN KEY ("match_team_id") REFERENCES "match_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_match_roster_id_fkey" FOREIGN KEY ("match_roster_id") REFERENCES "match_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_tournament_roster_id_fkey" FOREIGN KEY ("tournament_roster_id") REFERENCES "tournament_rosters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_statistics" ADD CONSTRAINT "player_match_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_rounds" ADD CONSTRAINT "tournament_bracket_rounds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_rounds" ADD CONSTRAINT "tournament_bracket_rounds_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "tournament_bracket_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_home_tournament_team_id_fkey" FOREIGN KEY ("home_tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_away_tournament_team_id_fkey" FOREIGN KEY ("away_tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_slots" ADD CONSTRAINT "tournament_bracket_slots_winner_tournament_team_id_fkey" FOREIGN KEY ("winner_tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_tournament_group_id_fkey" FOREIGN KEY ("tournament_group_id") REFERENCES "tournament_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_organization_user_affiliation_id_fkey" FOREIGN KEY ("organization_user_affiliation_id") REFERENCES "organization_user_affiliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_organization_team_affiliation_id_fkey" FOREIGN KEY ("organization_team_affiliation_id") REFERENCES "organization_team_affiliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tournament_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_mvp_tournament_roster_id_fkey" FOREIGN KEY ("mvp_tournament_roster_id") REFERENCES "tournament_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_champion_tournament_team_id_fkey" FOREIGN KEY ("champion_tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
