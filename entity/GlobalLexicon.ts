
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from "typeorm";

@Entity("global_lexicon")
@Index(["term", "sourceLang", "targetLang"], { unique: true })
export class GlobalLexicon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  term: string;

  @Column()
  sourceLang: string;

  @Column()
  targetLang: string;

  @Column("jsonb")
  data: any;

  @CreateDateColumn()
  createdAt: Date;
}
