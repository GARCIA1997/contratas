-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workspaceOwnerId" TEXT;

-- CreateIndex
CREATE INDEX "User_workspaceOwnerId_idx" ON "User"("workspaceOwnerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
