import database from '../config/database.js';
import bcrypt from 'bcryptjs';

async function initDatabase() {
  try {
    console.log('🔧 Initialisation de la base de données...');
    
    // Attendre que la base soit prête
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Vérifier si l'utilisateur admin existe
    const existingAdmin = database.queryOne(
      'SELECT * FROM users WHERE login = ?', 
      ['admin']
    );
    
    if (existingAdmin) {
      console.log('✅ Utilisateur admin existe déjà');
      console.log('📋 Login: admin');
      console.log('📋 Mot de passe: admin123');
      return;
    }
    
    // Créer l'utilisateur admin
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    database.query(
      'INSERT INTO users (login, mdp, admin) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 1]
    );
    
    console.log('✅ Utilisateur admin créé avec succès');
    console.log('📋 Login: admin');
    console.log('📋 Mot de passe: admin123');
    
    // Vérifier la création
    const newAdmin = database.queryOne(
      'SELECT login, admin FROM users WHERE login = ?', 
      ['admin']
    );
    
    console.log('✅ Vérification:', newAdmin);
    
    // Afficher les statistiques
    const userCount = database.queryOne('SELECT COUNT(*) as count FROM users');
    const esoldeCount = database.queryOne('SELECT COUNT(*) as count FROM esolde_mytable');
    const rhpoliceCount = database.queryOne('SELECT COUNT(*) as count FROM rhpolice_personne_concours');
    
    console.log('📊 Statistiques de la base:');
    console.log(`   - Utilisateurs: ${userCount.count}`);
    console.log(`   - Esolde: ${esoldeCount.count} enregistrements`);
    console.log(`   - RH Police: ${rhpoliceCount.count} enregistrements`);
    
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