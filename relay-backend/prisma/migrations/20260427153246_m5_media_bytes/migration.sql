/*
  Warnings:

  - You are about to drop the column `cloudinaryUrl` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `messageId` on the `MediaAsset` table. All the data in the column will be lost.
  - Added the required column `conversationId` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedBytes` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploadedBy` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_messageId_fkey";

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "cloudinaryUrl",
DROP COLUMN "messageId",
ADD COLUMN     "conversationId" TEXT NOT NULL,
ADD COLUMN     "encryptedBytes" BYTEA NOT NULL,
ADD COLUMN     "uploadedBy" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MediaAsset_conversationId_idx" ON "MediaAsset"("conversationId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
