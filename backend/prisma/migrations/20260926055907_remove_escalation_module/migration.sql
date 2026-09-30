/*
  Warnings:

  - You are about to drop the `escalation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `escalation` DROP FOREIGN KEY `Escalation_raisedById_fkey`;

-- DropTable
DROP TABLE `escalation`;
