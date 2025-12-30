
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity("search_history")
export class SearchHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  telegramId: string;

  @Column()
  term: string;

  @Column({ nullable: true })
  translation: string;

  @Column()
  sourceLang: string;

  @Column()
  targetLang: string;

  @Column({ nullable: true })
  category: string;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "telegramId" })
  user: User;
}
