import database from '../config/database.js';
import bcrypt from 'bcryptjs';

async function initDatabase() {
  try {
    console.log('🔧 Initialisation de la base de données...');
    
    // Attendre que la base soit prête
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Vérifier la connexion à la base
    console.log('🔧 Test de connexion à la base...');
    const testQuery = await database.queryOne('SELECT 1 as test');
    console.log('🔧 Test connexion résultat:', testQuery);
    
    // Vérifier si la table users existe
    console.log('🔧 Vérification de la table users...');
    try {
      const tableCheck = await database.queryOne('SELECT COUNT(*) as count FROM users');
      console.log('🔧 Table users existe, nombre d\'utilisateurs:', tableCheck.count);
    } catch (error) {
      console.log('🔧 Table users n\'existe pas encore, elle sera créée automatiquement');
    }
    
    // Vérifier si l'utilisateur admin existe
    console.log('🔧 Recherche de l\'utilisateur admin...');
    const existingAdmin = await database.queryOne(
      'SELECT * FROM users WHERE login = ?', 
      ['admin']
    );
    
    if (existingAdmin) {
      console.log('✅ Utilisateur admin existe déjà');
      console.log('✅ Admin details:', { 
        id: existingAdmin.id, 
        login: existingAdmin.login, 
        admin: existingAdmin.admin,
        hasPassword: !!existingAdmin.mdp
      });
      return;
    }
    
    console.log('🔧 Création de l\'utilisateur admin...');
    // Créer l'utilisateur admin
    const hashedPassword = await bcrypt.hash('admin123', 12);
    console.log('🔧 Password hashed, length:', hashedPassword.length);
    
    const result = await database.query(
      'INSERT INTO users (login, mdp, admin) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 1]
    );
    
    console.log('🔧 Insert result:', result);
    console.log('✅ Utilisateur admin créé avec succès');
    console.log('📋 Login: admin');
    console.log('📋 Mot de passe: admin123');
    
    // Vérifier la création
    const newAdmin = await database.queryOne(
      'SELECT login, admin FROM users WHERE login = ?', 
      ['admin']
    );
    
    console.log('✅ Vérification:', newAdmin);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    console.error('❌ Stack trace:', error.stack);
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