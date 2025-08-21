import database from '../config/database.js';
import bcrypt from 'bcryptjs';

async function initDatabase() {
  try {
    console.log('🔧 Initialisation de la base de données...');
    
    // Attendre que la base soit prête
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Vérifier si l'utilisateur admin existe
    const existingAdmin = await database.queryOne(
      'SELECT * FROM autres.users WHERE login = ?', 
      ['admin']
    );
    
    if (existingAdmin) {
      console.log('✅ Utilisateur admin existe déjà');
      return;
    }
    
    // Créer l'utilisateur admin
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await database.query(
      'INSERT INTO autres.users (login, mdp, admin) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 1]
    );
    
    console.log('✅ Utilisateur admin créé avec succès');
    console.log('📋 Login: admin');
    console.log('📋 Mot de passe: admin123');
    
    // Vérifier la création
    const newAdmin = await database.queryOne(
      'SELECT login, admin FROM autres.users WHERE login = ?', 
      ['admin']
    );
    
    console.log('✅ Vérification:', newAdmin);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase().then(() => {
    console.log('🎉 Initialisation terminée');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}

export default initDatabase;