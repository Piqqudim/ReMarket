-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SELLER';

-- AlterEnum
ALTER TYPE "SocialPlatform" ADD VALUE 'DIRECTIONS';

-- AlterTable
ALTER TABLE "SearchEvent" ADD COLUMN     "maxPrice" INTEGER,
ADD COLUMN     "minPrice" INTEGER;
