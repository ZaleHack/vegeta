import bcrypt from 'bcryptjs';
import database from '../config/database.js';

async function createAdminUser() {
  try {
    console.log('🔧 Initialisation de l\'utilisateur admin...');
    
    // Vérifier si l'utilisateur admin existe déjà
    const existingAdmin = await database.queryOne(
      'SELECT * FROM autres.users WHERE login = ?', 
      ['admin']
    );
    
    if (existingAdmin) {
      console.log('✅ L\'utilisateur admin existe déjà');
      console.log('📋 Login: admin');
      console.log('📋 Mot de passe: admin123');
      return;
    }
    
    // Créer l'utilisateur admin
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await database.query(`
      INSERT INTO autres.users (login, mdp, admin) 
      VALUES (?, ?, ?)
    `, ['admin', hashedPassword, 1]);
    
    console.log('✅ Utilisateur admin créé avec succès !');
    console.log('📋 Login: admin');
    console.log('📋 Mot de passe: admin123');
    console.log('📋 Rôle: Administrateur');
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error);
  } finally {
    await database.close();
    process.exit(0);
  }
}

createAdminUser();